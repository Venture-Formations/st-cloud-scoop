import { NextRequest, NextResponse } from 'next/server'
import { ScheduleChecker } from '@/lib/schedule-checker'
import { start } from 'workflow/api'
import { processRSSWorkflow } from '@/lib/workflows/process-rss-workflow'

export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization')
    console.log('Auth header received:', authHeader ? 'Present' : 'Missing')
    console.log('Expected format:', `Bearer ${process.env.CRON_SECRET?.substring(0, 5)}...`)

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log('Authentication failed - headers:', Object.fromEntries(request.headers.entries()))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('=== AUTOMATED RSS PROCESSING CHECK ===')
    console.log('Time:', new Date().toISOString())

    // Check if it's time to run RSS processing based on database settings
    const shouldRun = await ScheduleChecker.shouldRunRSSProcessing()

    if (!shouldRun) {
      return NextResponse.json({
        success: true,
        message: 'Not time to run RSS processing or already ran today',
        skipped: true,
        timestamp: new Date().toISOString()
      })
    }

    console.log('=== RSS WORKFLOW STARTING (Time Matched) ===')
    const currentCentralTime = new Date().toLocaleString("en-US", {timeZone: "America/Chicago"})
    console.log('Central Time:', currentCentralTime)

    // Get tomorrow's date for campaign creation (RSS processing is for next day)
    const now = new Date()

    // Create a date in Central Time using Intl.DateTimeFormat
    const centralFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })

    const centralDate = centralFormatter.format(now) // Returns YYYY-MM-DD in Central Time

    // Add one day to get tomorrow in Central Time
    const centralToday = new Date(centralDate + 'T00:00:00')
    const centralTomorrow = new Date(centralToday)
    centralTomorrow.setDate(centralToday.getDate() + 1)

    const campaignDate = centralTomorrow.toISOString().split('T')[0]

    console.log('Processing RSS for tomorrow\'s campaign date:', campaignDate)
    console.log('Debug: UTC now:', now.toISOString())
    console.log('Debug: Central date today:', centralDate)
    console.log('Debug: Central tomorrow:', campaignDate)

    // Start workflow execution
    console.log('Starting RSS workflow...')
    await start(processRSSWorkflow, [{
      trigger: 'cron',
      campaign_date: campaignDate
    }])

    console.log('=== RSS WORKFLOW STARTED ===')
    console.log('Workflow will process in background with 15 steps')

    return NextResponse.json({
      success: true,
      message: 'RSS workflow started successfully for tomorrow\'s campaign',
      campaignDate: campaignDate,
      note: 'Workflow running in background with 15 independent steps',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('=== RSS WORKFLOW START FAILED ===')
    console.error('Error:', error)

    return NextResponse.json({
      success: false,
      error: 'Failed to start RSS workflow',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// Handle GET requests from Vercel cron (no auth header, uses URL secret)
export async function GET(request: NextRequest) {
  try {
    // For Vercel cron: check secret in URL params, for manual: require secret param
    const searchParams = new URL(request.url).searchParams
    const secret = searchParams.get('secret')

    // Allow both manual testing (with secret param) and Vercel cron (no auth needed)
    const isVercelCron = !secret && !searchParams.has('secret')
    const isManualTest = secret === process.env.CRON_SECRET

    if (!isVercelCron && !isManualTest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('=== AUTOMATED RSS PROCESSING CHECK (GET) ===')
    console.log('Time:', new Date().toISOString())
    console.log('Request type:', isVercelCron ? 'Vercel Cron' : 'Manual Test')

    // Check if it's time to run RSS processing based on database settings
    const shouldRun = await ScheduleChecker.shouldRunRSSProcessing()

    if (!shouldRun) {
      return NextResponse.json({
        success: true,
        message: 'Not time to run RSS processing or already ran today',
        skipped: true,
        timestamp: new Date().toISOString()
      })
    }

    console.log('=== RSS WORKFLOW STARTING (Time Matched) ===')
    const currentCentralTime = new Date().toLocaleString("en-US", {timeZone: "America/Chicago"})
    console.log('Central Time:', currentCentralTime)

    // Get tomorrow's date for campaign creation (RSS processing is for next day)
    const now = new Date()

    // Create a date in Central Time using Intl.DateTimeFormat
    const centralFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })

    const centralDate = centralFormatter.format(now) // Returns YYYY-MM-DD in Central Time

    // Add one day to get tomorrow in Central Time
    const centralToday = new Date(centralDate + 'T00:00:00')
    const centralTomorrow = new Date(centralToday)
    centralTomorrow.setDate(centralToday.getDate() + 1)

    const campaignDate = centralTomorrow.toISOString().split('T')[0]

    console.log('Processing RSS for tomorrow\'s campaign date:', campaignDate)
    console.log('Debug: UTC now:', now.toISOString())
    console.log('Debug: Central date today:', centralDate)
    console.log('Debug: Central tomorrow:', campaignDate)

    // Start workflow execution
    console.log('Starting RSS workflow...')
    await start(processRSSWorkflow, [{
      trigger: 'cron',
      campaign_date: campaignDate
    }])

    console.log('=== RSS WORKFLOW STARTED ===')
    console.log('Workflow will process in background with 15 steps')

    return NextResponse.json({
      success: true,
      message: 'RSS workflow started successfully for tomorrow\'s campaign',
      campaignDate: campaignDate,
      note: 'Workflow running in background with 15 independent steps',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('=== RSS WORKFLOW START FAILED ===')
    console.error('Error:', error)

    return NextResponse.json({
      success: false,
      error: 'Failed to start RSS workflow',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

export const maxDuration = 60  // Workflow trigger only needs 60 seconds
