import { NextRequest, NextResponse } from 'next/server'
import { AI_PROMPTS, callOpenAI } from '@/lib/openai'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const campaignDate = searchParams.get('campaign_date') || 'Sep 25, 2025'

    console.log(`Testing road work generation for date: ${campaignDate}`)

    // Generate road work data using AI directly
    const prompt = AI_PROMPTS.roadWorkGenerator(campaignDate)
    console.log('Calling AI for road work generation...')

    const aiResponse = await callOpenAI(prompt, 3000, 0.7)
    console.log('AI response received:', typeof aiResponse)

    // Parse AI response
    let roadWorkItems: any[] = []
    let parseError = null

    try {
      if (typeof aiResponse === 'string') {
        roadWorkItems = JSON.parse(aiResponse)
      } else if (Array.isArray(aiResponse)) {
        roadWorkItems = aiResponse
      } else if (aiResponse && typeof aiResponse === 'object' && (aiResponse as any).raw) {
        roadWorkItems = JSON.parse((aiResponse as any).raw)
      } else {
        throw new Error('Unexpected AI response format')
      }
    } catch (error) {
      parseError = error instanceof Error ? error.message : 'Parse error'
      console.error('Failed to parse AI response:', error)
    }

    // Ensure we have exactly 9 items
    if (Array.isArray(roadWorkItems) && roadWorkItems.length < 9) {
      while (roadWorkItems.length < 9) {
        roadWorkItems.push({
          road_name: 'No Additional Closures',
          road_range: 'N/A',
          city_or_township: 'St. Cloud Area',
          reason: 'No major closures reported',
          start_date: campaignDate.split(',')[0] || 'Sep 25',
          expected_reopen: 'N/A',
          source_url: 'https://www.dot.state.mn.us/d3/'
        })
      }
    }

    if (Array.isArray(roadWorkItems) && roadWorkItems.length > 9) {
      roadWorkItems = roadWorkItems.slice(0, 9)
    }

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      total_items: Array.isArray(roadWorkItems) ? roadWorkItems.length : 0,
      roadWorkItems: roadWorkItems,
      parseError,
      rawResponse: typeof aiResponse === 'string' ? aiResponse.substring(0, 500) : 'Non-string response'
    })

  } catch (error) {
    console.error('Road work test failed:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}