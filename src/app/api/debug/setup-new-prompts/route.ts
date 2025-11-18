import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const prompts = [
      {
        key: 'ai_prompt_wordle_definition',
        value: {
          model: 'gpt-4o',
          temperature: 0.2,
          max_output_tokens: 100,
          text: 'You are a dictionary editor creating clear, concise definitions.',
          input: [
            {
              role: 'user',
              content: 'Provide a brief, clear definition of the word "{{word}}". Keep it under 50 words and make it suitable for a general audience. Return only the definition with no extra formatting or preamble.'
            }
          ]
        },
        ai_provider: 'openai',
        description: 'Generates concise dictionary definitions for Wordle words (under 50 words)'
      },
      {
        key: 'ai_prompt_wordle_fact',
        value: {
          model: 'gpt-4o',
          temperature: 0.3,
          max_output_tokens: 150,
          text: 'You are a linguistics expert sharing interesting word facts.',
          input: [
            {
              role: 'user',
              content: 'Share one interesting fact about the word "{{word}}" - its etymology, historical usage, or linguistic background. Keep it under 80 words and make it engaging. Return only the fact with no extra formatting or preamble.'
            }
          ]
        },
        ai_provider: 'openai',
        description: 'Generates interesting linguistic facts about Wordle words (under 80 words)'
      },
      {
        key: 'ai_prompt_road_work_parser',
        value: {
          model: 'gpt-4o',
          temperature: 0.2,
          max_output_tokens: 3000,
          text: 'You are analyzing real road construction web pages from St. Cloud, MN area government websites.',
          input: [
            {
              role: 'user',
              content: `Today's date: {{targetDate}}

I have fetched the following pages:
{{content}}

Extract ALL active road work projects that are currently ongoing on {{targetDate}}. Return ONLY a JSON array with this exact format:

[
  {
    "road_name": "Highway 15",
    "road_range": "from 2nd St to County Rd 75",
    "city_or_township": "St. Cloud",
    "reason": "Bridge maintenance",
    "start_date": "Sep 15",
    "expected_reopen": "Oct 10",
    "source_url": "https://www.dot.state.mn.us/d3/"
  }
]

CRITICAL:
- Extract real, specific projects from the page content above
- Only include projects active on {{targetDate}}
- Use the actual source URL where you found each project (from: {{sourceUrl}})
- Extract 6-9 projects if available
- Use short date format (mmm d)
- Return ONLY the JSON array, no markdown or explanations`
            }
          ]
        },
        ai_provider: 'openai',
        description: 'Parses road construction data from St. Cloud area government websites and extracts active projects'
      }
    ]

    const results = []

    for (const prompt of prompts) {
      // Check if prompt already exists
      const { data: existing } = await supabaseAdmin
        .from('app_settings')
        .select('key')
        .eq('key', prompt.key)
        .single()

      if (existing) {
        console.log(`✓ Prompt ${prompt.key} already exists, skipping`)
        results.push({ key: prompt.key, status: 'already_exists' })
        continue
      }

      // Insert new prompt
      const { error } = await supabaseAdmin
        .from('app_settings')
        .insert([{
          key: prompt.key,
          value: prompt.value,
          ai_provider: prompt.ai_provider,
          description: prompt.description
        }])

      if (error) {
        console.error(`✗ Failed to insert ${prompt.key}:`, error)
        results.push({ key: prompt.key, status: 'error', error: error.message })
      } else {
        console.log(`✓ Successfully inserted ${prompt.key}`)
        results.push({ key: prompt.key, status: 'created' })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Setup complete',
      results: results
    })

  } catch (error) {
    console.error('Setup failed:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
