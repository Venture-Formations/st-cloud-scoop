import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { newsletterArchiver } from '@/lib/newsletter-archiver'

/**
 * Manual Newsletter Archiving Endpoint
 * Used to archive newsletters that were sent before archiving was implemented
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaign_id')

    if (!campaignId) {
      return NextResponse.json({
        error: 'Missing campaign_id parameter'
      }, { status: 400 })
    }

    console.log(`[MANUAL ARCHIVE] Starting manual archive for campaign: ${campaignId}`)

    // Fetch campaign data
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select('id, date, subject_line, status, final_sent_at')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({
        error: 'Campaign not found',
        details: campaignError?.message
      }, { status: 404 })
    }

    console.log(`[MANUAL ARCHIVE] Found campaign:`, campaign)

    // Check if already archived
    const { data: existing } = await supabaseAdmin
      .from('archived_newsletters')
      .select('id')
      .eq('campaign_id', campaignId)
      .single()

    if (existing) {
      return NextResponse.json({
        success: false,
        message: 'Campaign is already archived',
        archive_id: existing.id
      })
    }

    // Archive the newsletter
    const archiveResult = await newsletterArchiver.archiveNewsletter({
      campaignId: campaign.id,
      campaignDate: campaign.date,
      subjectLine: campaign.subject_line || 'Newsletter',
      recipientCount: 0
    })

    if (!archiveResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to archive newsletter',
        details: archiveResult.error
      }, { status: 500 })
    }

    console.log(`[MANUAL ARCHIVE] ✓ Successfully archived campaign ${campaign.date}`)

    return NextResponse.json({
      success: true,
      message: 'Newsletter archived successfully',
      campaign: {
        id: campaign.id,
        date: campaign.date,
        subject_line: campaign.subject_line,
        status: campaign.status
      },
      archive_id: archiveResult.id
    })

  } catch (error) {
    console.error('[MANUAL ARCHIVE] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to archive newsletter',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
