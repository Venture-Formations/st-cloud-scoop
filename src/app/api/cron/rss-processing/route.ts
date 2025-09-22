import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { RSSProcessor } from '@/lib/rss-processor'
import { ScheduleChecker } from '@/lib/schedule-checker'
import { AI_PROMPTS, callOpenAI } from '@/lib/openai'

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

    console.log('=== RSS PROCESSING STARTED (Time Matched) ===')
    console.log('Central Time:', new Date().toLocaleString("en-US", {timeZone: "America/Chicago"}))

    // Get tomorrow's date for campaign creation (RSS processing is for next day)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const campaignDate = tomorrow.toISOString().split('T')[0]

    console.log('Processing RSS for tomorrow\'s campaign date:', campaignDate)

    // STEP 1: Create tomorrow's campaign first
    console.log('Creating campaign for tomorrow before processing RSS...')

    // Check if campaign already exists for tomorrow
    const { data: existingCampaign } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select('id, status')
      .eq('date', campaignDate)
      .single()

    if (existingCampaign) {
      console.log('Campaign already exists for tomorrow:', existingCampaign.id, 'Status:', existingCampaign.status)

      // Only process if campaign is in draft status
      if (existingCampaign.status !== 'draft') {
        return NextResponse.json({
          success: true,
          message: `Campaign for ${campaignDate} already exists with status: ${existingCampaign.status}`,
          campaignId: existingCampaign.id,
          skipped: true
        })
      }
    }

    // Initialize RSS processor
    const rssProcessor = new RSSProcessor()

    let campaignId: string

    if (existingCampaign) {
      campaignId = existingCampaign.id
      console.log('Using existing campaign:', campaignId)
    } else {
      // Create new campaign for tomorrow
      const { data: newCampaign, error: campaignError } = await supabaseAdmin
        .from('newsletter_campaigns')
        .insert([{
          date: campaignDate,
          status: 'draft'
        }])
        .select()
        .single()

      if (campaignError || !newCampaign) {
        throw new Error(`Failed to create campaign: ${campaignError?.message}`)
      }

      campaignId = newCampaign.id
      console.log('Created new campaign for tomorrow:', campaignId)
    }

    // Process RSS feeds for the specific campaign
    console.log('Starting RSS processing...')
    await rssProcessor.processAllFeedsForCampaign(campaignId)

    console.log('=== RSS PROCESSING COMPLETED ===')
    console.log('Subject line generation now happens during RSS processing')

    return NextResponse.json({
      success: true,
      message: 'RSS processing and subject line generation completed successfully for tomorrow\'s campaign',
      campaignId: campaignId,
      campaignDate: campaignDate,
      note: 'Campaign created for next day delivery with AI subject line',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('=== RSS PROCESSING FAILED ===')
    console.error('Error:', error)

    return NextResponse.json({
      success: false,
      error: 'RSS processing failed',
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

    console.log('=== RSS PROCESSING STARTED (Time Matched) ===')
    console.log('Central Time:', new Date().toLocaleString("en-US", {timeZone: "America/Chicago"}))

    // Get tomorrow's date for campaign creation (RSS processing is for next day)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const campaignDate = tomorrow.toISOString().split('T')[0]

    console.log('Processing RSS for tomorrow\'s campaign date:', campaignDate)

    // STEP 1: Create tomorrow's campaign first
    console.log('Creating campaign for tomorrow before processing RSS...')

    // Check if campaign already exists for tomorrow
    const { data: existingCampaign } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select('id, status')
      .eq('date', campaignDate)
      .single()

    let campaignId: string

    if (existingCampaign) {
      console.log('Campaign already exists for tomorrow:', existingCampaign.id, 'Status:', existingCampaign.status)
      campaignId = existingCampaign.id
    } else {
      // Create new campaign for tomorrow
      const { data: newCampaign, error: campaignError } = await supabaseAdmin
        .from('newsletter_campaigns')
        .insert([{
          date: campaignDate,
          subject_line: '', // Will be generated later
          status: 'draft',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select('id')
        .single()

      if (campaignError || !newCampaign) {
        throw new Error(`Failed to create campaign: ${campaignError?.message}`)
      }

      campaignId = newCampaign.id
      console.log('Created new campaign for tomorrow:', campaignId)
    }

    // Process RSS feeds for the specific campaign
    console.log('Starting RSS processing...')
    const rssProcessor = new RSSProcessor()
    await rssProcessor.processAllFeedsForCampaign(campaignId)

    console.log('=== RSS PROCESSING COMPLETED ===')
    console.log('Subject line generation now happens during RSS processing')

    return NextResponse.json({
      success: true,
      message: 'RSS processing and subject line generation completed successfully for tomorrow\'s campaign',
      campaignId: campaignId,
      campaignDate: campaignDate,
      note: 'Campaign created for next day delivery with AI subject line',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('=== RSS PROCESSING FAILED ===')
    console.error('Error:', error)

    return NextResponse.json({
      success: false,
      error: 'RSS processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}