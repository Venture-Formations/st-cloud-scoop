import { NextRequest, NextResponse } from 'next/server'
import { generateDailyRoadWork } from '@/lib/road-work-manager'

export async function GET(request: NextRequest) {
  console.log('🚧 Starting road work data generation...')

  try {
    // Get campaign date from query parameters if provided
    const { searchParams } = new URL(request.url)
    const campaignDate = searchParams.get('campaign_date')

    // Generate new road work data
    const roadWorkData = await generateDailyRoadWork(campaignDate || undefined)
    console.log('✅ Road work data generated successfully')

    return NextResponse.json({
      success: true,
      message: 'Road work data generated successfully',
      roadWork: {
        generated_at: roadWorkData.generated_at,
        total_items: roadWorkData.road_work_data.length,
        has_html: !!roadWorkData.html_content
      },
      roadWorkData: roadWorkData.road_work_data
    })

  } catch (error) {
    console.error('❌ Road work generation failed:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to generate road work data'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}