import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { MailerLiteService } from '@/lib/mailerlite'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Fetch campaign with articles
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
      .eq('id', id)
      .single()

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status !== 'draft' && campaign.status !== 'in_review') {
      return NextResponse.json({
        error: 'Campaign cannot be sent for review in current status'
      }, { status: 400 })
    }

    const mailerLiteService = new MailerLiteService()
    const result = await mailerLiteService.createReviewCampaign(campaign)

    // Log user activity
    if (session.user?.email) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', session.user.email)
        .single()

      if (user) {
        await supabaseAdmin
          .from('user_activities')
          .insert([{
            user_id: user.id,
            campaign_id: id,
            action: 'review_campaign_sent',
            details: { mailerlite_campaign_id: result.campaignId }
          }])
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Review campaign sent successfully',
      mailerlite_campaign_id: result.campaignId
    })

  } catch (error) {
    console.error('Failed to send review campaign:', error)
    return NextResponse.json({
      error: 'Failed to send review campaign',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}