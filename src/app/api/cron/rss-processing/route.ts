import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { RSSProcessor } from '@/lib/rss-processor'

export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('=== AUTOMATED RSS PROCESSING STARTED ===')
    console.log('Time:', new Date().toISOString())

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

    return NextResponse.json({
      success: true,
      message: 'RSS processing completed successfully for tomorrow\'s campaign',
      campaignId: campaignId,
      campaignDate: campaignDate,
      note: 'Campaign created for next day delivery',
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

// Also allow GET for manual testing
export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams
  const secret = searchParams.get('secret')

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Create a fake POST request for processing
  const fakeRequest = new Request(request.url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${process.env.CRON_SECRET}`
    }
  })

  return POST(fakeRequest as NextRequest)
}