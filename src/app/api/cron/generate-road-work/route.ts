import { NextRequest, NextResponse } from 'next/server'
import { generateDailyRoadWork } from '@/lib/road-work-manager'
import { checkSchedule } from '@/lib/schedule-checker'

export async function GET(request: NextRequest) {
  try {
    console.log('🚧 Road Work cron job starting...')
    const { searchParams } = new URL(request.url)

    // Check if this is a manual test with secret
    const testSecret = searchParams.get('secret')
    const isManualTest = testSecret === 'test-road-work-generation'

    // For Vercel cron (no secret) or manual test with secret
    if (!isManualTest) {
      console.log('Vercel cron job - checking schedule...')

      // Check if we should run road work generation at this time
      const scheduleCheck = await checkSchedule('generate-road-work')

      if (!scheduleCheck.shouldRun) {
        console.log('⏰ Not time to generate road work yet:', scheduleCheck.reason)
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: scheduleCheck.reason,
          nextRun: scheduleCheck.nextRun
        })
      }
    }

    console.log('✅ Schedule check passed, generating road work data...')

    // Generate road work data for tomorrow
    const roadWorkData = await generateDailyRoadWork()
    console.log('✅ Road work data generated successfully:', roadWorkData.id)

    console.log('🚧 Road work cron job completed successfully')

    return NextResponse.json({
      success: true,
      message: 'Road work data generated successfully',
      roadWork: {
        id: roadWorkData.id,
        generated_at: roadWorkData.generated_at,
        total_items: roadWorkData.road_work_data.length,
        campaign_id: roadWorkData.campaign_id,
        is_active: roadWorkData.is_active
      },
      isManualTest
    })

  } catch (error) {
    console.error('❌ Road work cron job failed:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Road work generation failed'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}