import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { MailerLiteService } from '@/lib/mailerlite'
import { ScheduleChecker } from '@/lib/schedule-checker'

export async function POST(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('=== AUTOMATED FINAL SEND CHECK ===')
    console.log('Time:', new Date().toISOString())

    // Check if it's time to run final send based on database settings
    const shouldRun = await ScheduleChecker.shouldRunFinalSend()

    if (!shouldRun) {
      return NextResponse.json({
        success: true,
        message: 'Not time to run final send or already ran today',
        skipped: true,
        timestamp: new Date().toISOString()
      })
    }

    console.log('=== FINAL SEND STARTED (Time Matched) ===')
    console.log('Central Time:', new Date().toLocaleString("en-US", {timeZone: "America/Chicago"}))

    // Get today's campaign that's ready to send (use Central Time for consistency)
    const nowCentral = new Date().toLocaleString("en-US", {timeZone: "America/Chicago"})
    const centralDate = new Date(nowCentral)
    const today = centralDate.toISOString().split('T')[0]

    const { data: campaign, error } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select(`
        *,
        articles:articles(
          *,
          rss_post:rss_posts(
            *,
            rss_feed:rss_feeds(*)
          )
        ),
        manual_articles:manual_articles(*)
      `)
      .eq('date', today)
      .in('status', ['in_review', 'changes_made'])
      .single()

    if (error || !campaign) {
      console.log('No campaign ready to send for today')
      return NextResponse.json({
        message: 'No campaign ready to send for today',
        timestamp: new Date().toISOString()
      })
    }

    // Check if we have any active articles
    const activeArticles = campaign.articles.filter((article: any) => article.is_active)
    if (activeArticles.length === 0) {
      console.log('Campaign has no active articles, skipping send')
      return NextResponse.json({
        message: 'Campaign has no active articles, skipping send',
        timestamp: new Date().toISOString()
      })
    }

    // Send the final campaign
    const mailerLiteService = new MailerLiteService()

    // Get main group ID from settings
    const { data: mainGroupSetting } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'email_mainGroupId')
      .single()

    const mainGroupId = mainGroupSetting?.value

    if (!mainGroupId) {
      throw new Error('Main group ID not configured in settings')
    }

    console.log('Using main group ID from settings:', mainGroupId)

    const result = await mailerLiteService.createFinalCampaign(campaign, mainGroupId)

    return NextResponse.json({
      success: true,
      message: 'Final newsletter sent successfully',
      campaignId: campaign.id,
      mailerliteCampaignId: result.campaignId,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Scheduled final newsletter send failed:', error)

    return NextResponse.json({
      error: 'Final newsletter send failed',
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

    console.log('=== AUTOMATED FINAL SEND CHECK (GET) ===')
    console.log('Time:', new Date().toISOString())
    console.log('Request type:', isVercelCron ? 'Vercel Cron' : 'Manual Test')

    // Check if it's time to run final send based on database settings
    const shouldRun = await ScheduleChecker.shouldRunFinalSend()

    if (!shouldRun) {
      return NextResponse.json({
        success: true,
        message: 'Not time to run final send or already ran today',
        skipped: true,
        timestamp: new Date().toISOString()
      })
    }

    console.log('=== FINAL SEND STARTED (Time Matched) ===')
    console.log('Central Time:', new Date().toLocaleString("en-US", {timeZone: "America/Chicago"}))

    // Get today's campaign that's ready to send (use Central Time for consistency)
    const nowCentral = new Date().toLocaleString("en-US", {timeZone: "America/Chicago"})
    const centralDate = new Date(nowCentral)
    const today = centralDate.toISOString().split('T')[0]

    const { data: campaign, error } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select(`
        *,
        articles:articles(
          *,
          rss_post:rss_posts(
            *,
            rss_feed:rss_feeds(*)
          )
        ),
        manual_articles:manual_articles(*)
      `)
      .eq('date', today)
      .in('status', ['in_review', 'changes_made'])
      .single()

    if (error || !campaign) {
      console.log('No campaign ready to send for today')
      return NextResponse.json({
        message: 'No campaign ready to send for today',
        timestamp: new Date().toISOString()
      })
    }

    // Check if we have any active articles
    const activeArticles = campaign.articles.filter((article: any) => article.is_active)
    if (activeArticles.length === 0) {
      console.log('Campaign has no active articles, skipping send')
      return NextResponse.json({
        message: 'Campaign has no active articles, skipping send',
        timestamp: new Date().toISOString()
      })
    }

    // Send the final campaign
    const mailerLiteService = new MailerLiteService()

    // Get main group ID from settings
    const { data: mainGroupSetting } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'email_mainGroupId')
      .single()

    const mainGroupId = mainGroupSetting?.value

    if (!mainGroupId) {
      throw new Error('Main group ID not configured in settings')
    }

    console.log('Using main group ID from settings:', mainGroupId)

    const result = await mailerLiteService.createFinalCampaign(campaign, mainGroupId)

    return NextResponse.json({
      success: true,
      message: 'Final newsletter sent successfully',
      campaignId: campaign.id,
      mailerliteCampaignId: result.campaignId,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Scheduled final newsletter send failed:', error)

    return NextResponse.json({
      error: 'Final newsletter send failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}