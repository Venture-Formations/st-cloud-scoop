import { NextRequest, NextResponse } from 'next/server'
import { generateDailyRoadWork, storeRoadWorkItems } from '@/lib/road-work-manager'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  console.log('🚧 Starting road work data generation...')

  try {
    // Get campaign date and campaign ID from query parameters
    const { searchParams } = new URL(request.url)
    const campaignDate = searchParams.get('campaign_date')
    let campaignId = searchParams.get('campaign_id')

    // If no campaign ID provided, look up today's campaign
    if (!campaignId) {
      const supabase = await createClient()
      const targetDate = campaignDate || new Date().toISOString().split('T')[0]

      const { data: campaign } = await supabase
        .from('campaigns')
        .select('id')
        .eq('date', targetDate)
        .single()

      if (campaign) {
        campaignId = campaign.id
        console.log(`Found campaign ID ${campaignId} for date ${targetDate}`)
      } else {
        console.warn(`No campaign found for date ${targetDate}`)
      }
    }

    // Generate new road work data
    const roadWorkData = await generateDailyRoadWork(campaignDate || undefined)
    console.log('✅ Road work data generated successfully')

    // Store items in normalized database if we have data and campaign ID
    let storedItems = []
    if (roadWorkData.road_work_data && roadWorkData.road_work_data.length > 0 && campaignId) {
      console.log(`Storing ${roadWorkData.road_work_data.length} road work items in normalized database`)
      storedItems = await storeRoadWorkItems(roadWorkData.road_work_data, campaignId)
      console.log(`✅ Stored ${storedItems.length} items in normalized database`)
    }

    return NextResponse.json({
      success: true,
      message: 'Road work data generated and stored successfully',
      roadWork: {
        generated_at: roadWorkData.generated_at,
        total_items: roadWorkData.road_work_data.length,
        has_html: !!roadWorkData.html_content
      },
      roadWorkData: roadWorkData.road_work_data,
      normalized_storage: {
        items_stored: storedItems.length,
        campaign_id: campaignId
      }
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