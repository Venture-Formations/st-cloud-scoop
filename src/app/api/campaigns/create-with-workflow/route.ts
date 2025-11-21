import { NextRequest, NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { processRSSWorkflow } from '@/lib/workflows/process-rss-workflow'

/**
 * Manual Campaign Creation with Workflow
 * Allows users to create a campaign for a specific date by triggering the workflow
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { campaign_date } = body

    if (!campaign_date) {
      return NextResponse.json({
        error: 'campaign_date is required',
        message: 'Please provide a campaign_date in YYYY-MM-DD format'
      }, { status: 400 })
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(campaign_date)) {
      return NextResponse.json({
        error: 'Invalid date format',
        message: 'campaign_date must be in YYYY-MM-DD format'
      }, { status: 400 })
    }

    // Validate date is not in the past
    const campaignDate = new Date(campaign_date + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (campaignDate < today) {
      return NextResponse.json({
        error: 'Invalid date',
        message: 'Cannot create campaigns for past dates'
      }, { status: 400 })
    }

    console.log(`[Manual Campaign] Starting workflow for date: ${campaign_date}`)

    // Start the workflow
    await start(processRSSWorkflow, [{
      trigger: 'manual',
      campaign_date: campaign_date
    }])

    console.log(`[Manual Campaign] Workflow started successfully for ${campaign_date}`)

    return NextResponse.json({
      success: true,
      message: 'Campaign workflow started successfully',
      campaignDate: campaign_date,
      note: 'The workflow is now running in the background. The campaign will be created with 10 independent steps, each with its own timeout and retry logic.',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Manual Campaign] Failed to start workflow:', error)

    return NextResponse.json({
      error: 'Failed to start campaign workflow',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

export const maxDuration = 60
