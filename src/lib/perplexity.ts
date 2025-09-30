/**
 * Perplexity AI Integration
 * Uses Perplexity's sonar-pro model with web search capabilities
 * This is what Make uses and gives much better real-time results
 */

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface PerplexityResponse {
  id: string
  model: string
  created: number
  choices: Array<{
    index: number
    finish_reason: string
    message: {
      role: string
      content: string
    }
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Call Perplexity AI with web search enabled
 * This replicates the Make.com Perplexity module
 */
export async function callPerplexity(
  prompt: string,
  options: {
    model?: string
    temperature?: number
    searchContextSize?: 'low' | 'medium' | 'high'
  } = {}
): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY

  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY not configured')
  }

  const {
    model = 'sonar-pro',
    temperature = 0.2,
    searchContextSize = 'medium'
  } = options

  console.log('🔍 Calling Perplexity AI with web search...')
  console.log('Model:', model)
  console.log('Search context:', searchContextSize)

  const messages: PerplexityMessage[] = [
    {
      role: 'user',
      content: prompt
    }
  ]

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        search_context_size: searchContextSize,
        return_images: false,
        return_related_questions: false
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Perplexity API error:', response.status, errorText)
      throw new Error(`Perplexity API error: ${response.status}`)
    }

    const data: PerplexityResponse = await response.json()

    console.log('✅ Perplexity response received')
    console.log('Tokens used:', data.usage.total_tokens)

    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No content in Perplexity response')
    }

    return content

  } catch (error) {
    console.error('Perplexity API call failed:', error)
    throw error
  }
}

/**
 * Get road work data using Perplexity (Make-style approach)
 */
export async function getRoadWorkWithPerplexity(targetDate: string): Promise<any[]> {
  console.log('🔍 Using Perplexity AI for road work (Make-style)...')

  // Format the date for display
  const dateObj = new Date(targetDate)
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const prompt = `List every active road, lane, or bridge closure, detour, or major traffic restriction in effect on ${formattedDate} within 15 miles of ZIP code 56303 (St. Cloud, MN).

INCLUDE:
- Full closures, lane closures, bridge closures, detours, major traffic restrictions
- Current closures that started before ${targetDate} and are still active
- Closures from all road types (state highways, county roads, city streets)
- Lane-specific closures (e.g., westbound/eastbound)
- Closures near city boundaries or small towns like Kimball, Annandale, Sartell, Sauk Rapids, Waite Park, St. Joseph

EXCLUDE:
- Completed closures
- Future/planned closures not yet active
- Shoulder-only work

SOURCES TO CHECK:
- https://www.dot.state.mn.us/d3/
- https://www.stearnscountymn.gov/185/Public-Works
- https://www.co.benton.mn.us/180/Highway
- https://www.co.sherburne.mn.us/162/Public-Works
- https://www.sartellmn.com/engineering/
- https://www.ci.stcloud.mn.us
- https://www.cityofstjoseph.com/
- https://www.ci.waitepark.mn.us/
- https://ci.sauk-rapids.mn.us/
- https://www.ridemetrobus.com
- Local media: WJON Traffic, St. Cloud Times Roads section

Return EXACTLY 9 items as a JSON array with this structure:
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
- Return EXACTLY 9 items
- Only closures active on ${targetDate}
- Use date format "mmm d" (e.g., "Sep 15")
- Return ONLY the JSON array starting with [ and ending with ]
- No markdown, no explanations, no code blocks`

  try {
    const response = await callPerplexity(prompt, {
      model: 'sonar-pro',
      temperature: 0.2,
      searchContextSize: 'medium'
    })

    console.log('Raw Perplexity response length:', response.length)
    console.log('Response preview:', response.substring(0, 200))

    // Extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('No JSON array found in Perplexity response')
      console.error('Full response:', response)
      return []
    }

    const parsed = JSON.parse(jsonMatch[0])
    console.log(`✅ Parsed ${parsed.length} road work items from Perplexity`)

    return parsed

  } catch (error) {
    console.error('Perplexity road work extraction failed:', error)
    return []
  }
}