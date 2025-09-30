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

  const prompt = `Today is ${formattedDate} (${targetDate}).

Search for ALL active road construction, closures, and traffic restrictions in the St. Cloud, Minnesota area (within 15 miles) that are currently happening today.

Check these official sources:
- St. Cloud city website: www.ci.stcloud.mn.us
- Stearns County: www.stearnscountymn.gov
- MnDOT District 3: www.dot.state.mn.us/d3/
- Benton County: www.co.benton.mn.us
- Local news: WJON, St. Cloud Times

Return ONLY a JSON array with 6-9 current road work items. Use this exact format:

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

Requirements:
- Only include projects active TODAY (${targetDate})
- Find real, specific projects from the sources above
- Use short date format like "Oct 15"
- Return ONLY the JSON array, no markdown or explanations`

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