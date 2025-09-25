import { NextRequest, NextResponse } from 'next/server'
import { generateDailyRoadWork } from '@/lib/road-work-manager'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const campaignDate = searchParams.get('campaign_date')

    console.log(`Testing road work generation for date: ${campaignDate || 'default (tomorrow)'}`)

    // Generate road work data
    const roadWorkData = await generateDailyRoadWork(campaignDate || undefined)

    return NextResponse.json({
      success: true,
      generated_at: roadWorkData.generated_at,
      total_items: roadWorkData.road_work_data.length,
      roadWorkItems: roadWorkData.road_work_data,
      html_content: roadWorkData.html_content
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