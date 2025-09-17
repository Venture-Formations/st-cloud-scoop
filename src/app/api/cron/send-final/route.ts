import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { MailerLiteService } from '@/lib/mailerlite'

export async function POST(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('Starting scheduled final newsletter send...')

    // Get today's campaign that's ready to send
    const today = new Date().toISOString().split('T')[0]

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
      .in('status', ['in_review', 'approved'])
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
    const result = await mailerLiteService.createFinalCampaign(campaign)

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

// For manual testing
export async function GET() {
  return NextResponse.json({
    message: 'Final newsletter send cron endpoint is active',
    timestamp: new Date().toISOString(),
    schedule: 'Daily at 4:55 AM CT'
  })
}