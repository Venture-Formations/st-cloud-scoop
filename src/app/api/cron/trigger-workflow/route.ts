import { NextRequest, NextResponse } from 'next/server'

/**
 * Workflow Trigger Cron
 * Runs every 5 minutes to check if it's time to execute the RSS workflow
 * for St. Cloud Scoop newsletter
 *
 * Schedule: */5 * * * * (every 5 minutes)
 * Timeout: 60 seconds
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const searchParams = new URL(request.url).searchParams
    const secret = searchParams.get('secret')

    const isVercelCron = !secret && !searchParams.has('secret')
    const isManualTest = secret === process.env.CRON_SECRET

    if (!isVercelCron && !isManualTest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Workflow Trigger] Checking if it\'s time to run RSS processing')

    // Check if it's time to run RSS processing
    const shouldRun = await shouldRunRSSProcessing()

    if (!shouldRun) {
      console.log('[Workflow Trigger] Not time yet for RSS processing')
      return NextResponse.json({
        success: true,
        message: 'Not scheduled at this time',
        skipped: true,
        timestamp: new Date().toISOString()
      })
    }

    console.log('[Workflow Trigger] Starting RSS workflow for St. Cloud Scoop')

    // For now, call the existing RSS processing endpoint
    // TODO: Replace with Vercel Workflow when @vercel/workflow is available
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

    const response = await fetch(`${baseUrl}/api/cron/rss-processing?secret=${process.env.CRON_SECRET}`, {
      method: 'GET'
    })

    const result = await response.json()

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'RSS workflow started',
        result,
        timestamp: new Date().toISOString()
      })
    } else {
      throw new Error(result.error || 'Workflow failed')
    }

  } catch (error) {
    console.error('[Workflow Trigger] Failed:', error)
    return NextResponse.json({
      error: 'Workflow trigger failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Check if it's time to run RSS processing based on schedule settings
 */
async function shouldRunRSSProcessing(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase')

    // Get schedule settings
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .in('key', ['email_reviewScheduleEnabled', 'email_rssProcessingTime'])

    const settingsMap = (settings || []).reduce((acc, setting) => {
      acc[setting.key] = setting.value
      return acc
    }, {} as Record<string, string>)

    const reviewScheduleEnabled = settingsMap['email_reviewScheduleEnabled'] === 'true'
    const rssProcessingTime = settingsMap['email_rssProcessingTime'] || '20:30'

    if (!reviewScheduleEnabled) {
      return false
    }

    // Get current time in Central Time
    const now = new Date()
    const centralTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}))
    const currentHours = centralTime.getHours()
    const currentMinutes = centralTime.getMinutes()
    const currentTime = `${currentHours.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}`

    console.log(`RSS Processing check: Current CT time ${currentTime}, Scheduled: ${rssProcessingTime}`)

    // Parse scheduled time
    const [schedHours, schedMinutes] = rssProcessingTime.split(':').map(Number)
    const scheduledTotalMinutes = schedHours * 60 + schedMinutes
    const currentTotalMinutes = currentHours * 60 + currentMinutes

    // Check if within 4-minute window
    const timeDiff = Math.abs(currentTotalMinutes - scheduledTotalMinutes)

    if (timeDiff > 4) {
      console.log(`Time window not matched: current ${currentTime}, scheduled ${rssProcessingTime}, diff ${timeDiff} minutes`)
      return false
    }

    // Check if already ran today
    const today = centralTime.toISOString().split('T')[0]

    const { data: lastRun } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'last_rss_processing_run')
      .single()

    if (lastRun && lastRun.value === today) {
      console.log(`Already ran today: ${today}`)
      return false
    }

    // Update last run date
    await supabaseAdmin
      .from('app_settings')
      .upsert({
        key: 'last_rss_processing_run',
        value: today,
        description: 'Last date RSS processing workflow ran',
        updated_at: new Date().toISOString()
      })

    console.log(`RSS processing scheduled to run at ${currentTime} on ${today}`)
    return true

  } catch (error) {
    console.error('Error checking RSS processing schedule:', error)
    return false
  }
}

export const maxDuration = 60
