import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const campaignId = resolvedParams.id

    // Verify campaign exists before deletion
    const { data: campaign, error: fetchError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select('id, date, status')
      .eq('id', campaignId)
      .single()

    if (fetchError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    console.log(`Deleting campaign ${campaignId} (${campaign.date}, status: ${campaign.status})`)

    // Delete related records first (cascading delete)

    // Delete campaign events
    const { error: campaignEventsError } = await supabaseAdmin
      .from('campaign_events')
      .delete()
      .eq('campaign_id', campaignId)

    if (campaignEventsError) {
      console.error('Error deleting campaign events:', campaignEventsError)
      return NextResponse.json(
        { error: 'Failed to delete campaign events' },
        { status: 500 }
      )
    }

    // Delete articles associated with this campaign
    const { error: articlesError } = await supabaseAdmin
      .from('articles')
      .delete()
      .eq('campaign_id', campaignId)

    if (articlesError) {
      console.error('Error deleting campaign articles:', articlesError)
      return NextResponse.json(
        { error: 'Failed to delete campaign articles' },
        { status: 500 }
      )
    }

    // Finally delete the campaign itself
    const { error: deleteError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .delete()
      .eq('id', campaignId)

    if (deleteError) {
      console.error('Error deleting campaign:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete campaign' },
        { status: 500 }
      )
    }

    console.log(`Successfully deleted campaign ${campaignId}`)

    return NextResponse.json({
      success: true,
      message: 'Campaign deleted successfully',
      deletedCampaign: {
        id: campaignId,
        date: campaign.date,
        status: campaign.status
      }
    })

  } catch (error) {
    console.error('Campaign deletion error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}