import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { callOpenAI } from '@/lib/openai'

// Create Wordle prompt function
function createWordlePrompt(date: string) {
  return `{
  "query": {
    "description": "Find the Wordle answer for ${date}, based on trusted spoiler sources and high-confidence solver reports. If the answer is not confirmed, return the most likely guess reported by multiple sources.",
    "criteria": {
      "date": "${date}",
      "required_fields": [
        "word",
        "definition",
        "interesting_fact"
      ],
      "field_constraints": {
        "definition": {
          "type": "string",
          "max_words": 30,
          "source": [
            "Merriam-Webster",
            "Oxford",
            "Collins"
          ]
        },
        "interesting_fact": {
          "type": "string",
          "max_words": 50,
          "style": "game show-worthy",
          "content": [
            "etymology",
            "pop culture use",
            "trivia",
            "historical notes"
          ],
          "source_required": true,
          "source_flexibility": "any reputable source"
        }
      },
      "sources": {
        "preferred": [
          "Reddit r/wordle daily thread",
          "wordlesolver.net",
          "Tom's Cafe Wordle spoiler site",
          "NYT WordleBot"
        ],
        "allow_additional_sources": true
      },
      "multiple_answers": {
        "allow": true,
        "format": "one object per answer",
        "label_alt": "(alt answer)"
      },
      "fallback": {
        "if_unconfirmed": [
          {
            "word": "Unknown",
            "definition": "Unknown",
            "interesting_fact": "Unknown"
          }
        ]
      }
    },
    "output_rules": {
      "format": "JSON_array_only",
      "json_starts_with": "[",
      "output_structure": [
        {
          "word": "string",
          "definition": "string (≤ 30 words)",
          "interesting_fact": "string (≤ 50 words, game show-worthy, do not show source)"
        }
      ],
      "no_extras": true
    }
  }
}

Do not wrap the output in triple backticks or markdown. Return on JSON. No comments or explainations`
}

async function collectWordleData(date: string) {
  console.log(`🧩 Collecting Wordle data for ${date}...`)

  // Check if we already have data for this date
  const { data: existing } = await supabaseAdmin
    .from('wordle')
    .select('*')
    .eq('date', date)
    .single()

  if (existing) {
    console.log(`✅ Wordle data already exists for ${date}`)
    return existing
  }

  // Generate the prompt for today's date
  const prompt = createWordlePrompt(date)

  // Call OpenAI with the prompt
  console.log('🤖 Calling OpenAI for Wordle data...')
  const aiResponse = await callOpenAI(prompt, 500, 0.7)

  // Parse the response
  let wordleData
  try {
    // The response should be a JSON array
    const responseArray = Array.isArray(aiResponse) ? aiResponse : JSON.parse(aiResponse)

    if (!Array.isArray(responseArray) || responseArray.length === 0) {
      throw new Error('Invalid response format - expected non-empty array')
    }

    // Take the first result
    wordleData = responseArray[0]

    if (!wordleData.word || !wordleData.definition || !wordleData.interesting_fact) {
      throw new Error('Missing required fields in Wordle data')
    }

  } catch (error) {
    console.error('Failed to parse AI response:', error)
    console.error('Raw response:', aiResponse)
    throw new Error('Failed to parse Wordle data from AI response')
  }

  // Insert into database
  const { data: newWordle, error } = await supabaseAdmin
    .from('wordle')
    .insert([{
      date,
      word: wordleData.word.toUpperCase(),
      definition: wordleData.definition,
      interesting_fact: wordleData.interesting_fact
    }])
    .select()
    .single()

  if (error) {
    console.error('Failed to insert Wordle data:', error)
    throw new Error(`Database insertion failed: ${error.message}`)
  }

  console.log(`✅ Wordle data collected and stored for ${date}:`, newWordle.word)
  return newWordle
}

// POST handler for Vercel cron
export async function POST(request: NextRequest) {
  console.log('🧩 Starting automated Wordle collection cron job...')

  try {
    // Verify cron secret for security (only for POST/cron requests)
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log('❌ Unauthorized cron request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ Cron authentication successful')

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0]

    const wordleData = await collectWordleData(today)

    return NextResponse.json({
      success: true,
      message: 'Wordle data collected successfully',
      data: {
        id: wordleData.id,
        date: wordleData.date,
        word: wordleData.word,
        definition: wordleData.definition.substring(0, 50) + '...',
        interesting_fact: wordleData.interesting_fact.substring(0, 50) + '...'
      }
    })

  } catch (error) {
    console.error('❌ Wordle collection cron job failed:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET handler for Vercel cron (newer pattern) and manual testing
export async function GET(request: NextRequest) {
  console.log('🧩 Starting Wordle collection...')

  try {
    // Check for manual testing with secret parameter
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    // For manual testing, require secret parameter
    if (secret && secret !== process.env.CRON_SECRET) {
      console.log('❌ Invalid secret for manual testing')
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
    }

    // Allow Vercel cron (no secret) or manual testing (with correct secret)
    console.log('✅ Request authorized')

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0]

    const wordleData = await collectWordleData(today)

    return NextResponse.json({
      success: true,
      message: secret ? 'Manual Wordle collection successful' : 'Automated Wordle collection successful',
      data: {
        id: wordleData.id,
        date: wordleData.date,
        word: wordleData.word,
        definition: wordleData.definition,
        interesting_fact: wordleData.interesting_fact,
        created_at: wordleData.created_at
      }
    })

  } catch (error) {
    console.error('❌ Wordle collection failed:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}