import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { MailerLiteService } from '@/lib/mailerlite'

export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('=== AUTOMATED CAMPAIGN CREATION STARTED ===')
    console.log('Time:', new Date().toISOString())

    // Get today's campaign
    const today = new Date()
    const campaignDate = today.toISOString().split('T')[0]

    console.log('Creating review campaign for date:', campaignDate)

    // Find today's campaign with articles
    const { data: campaign, error: campaignError } = await supabaseAdmin
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
      .eq('date', campaignDate)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({
        success: false,
        error: 'No campaign found for today',
        campaignDate: campaignDate
      }, { status: 404 })
    }

    console.log('Found campaign:', campaign.id, 'Status:', campaign.status)

    // Only create if campaign is in draft status
    if (campaign.status !== 'draft') {
      return NextResponse.json({
        success: true,
        message: `Campaign status is ${campaign.status}, skipping campaign creation`,
        campaignId: campaign.id,
        skipped: true
      })
    }

    // Check if campaign has active articles
    const activeArticles = campaign.articles.filter((article: any) => article.is_active)
    if (activeArticles.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No active articles found for campaign creation',
        campaignId: campaign.id
      }, { status: 400 })
    }

    console.log(`Campaign has ${activeArticles.length} active articles`)

    // Check if subject line exists
    if (!campaign.subject_line || campaign.subject_line.trim() === '') {
      return NextResponse.json({
        success: false,
        error: 'No subject line found for campaign. Run subject line generation first.',
        campaignId: campaign.id
      }, { status: 400 })
    }

    console.log('Using subject line:', campaign.subject_line)

    // Create MailerLite review campaign
    const mailerLiteService = new MailerLiteService()
    const result = await mailerLiteService.createReviewCampaign(campaign)

    console.log('MailerLite campaign created:', result.campaignId)

    // Update campaign status to in_review
    const { error: updateError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .update({
        status: 'in_review',
        review_sent_at: new Date().toISOString()
      })
      .eq('id', campaign.id)

    if (updateError) {
      console.error('Failed to update campaign status:', updateError)
      // Continue anyway since MailerLite campaign was created
    }

    console.log('=== CAMPAIGN CREATION COMPLETED ===')

    return NextResponse.json({
      success: true,
      message: 'Review campaign created successfully',
      campaignId: campaign.id,
      campaignDate: campaignDate,
      mailerliteCampaignId: result.campaignId,
      subjectLine: campaign.subject_line,
      activeArticlesCount: activeArticles.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('=== CAMPAIGN CREATION FAILED ===')
    console.error('Error:', error)

    return NextResponse.json({
      success: false,
      error: 'Campaign creation failed',
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