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
    // Order matters - delete child records before parent records

    // 1. Delete campaign events
    const { error: campaignEventsError } = await supabaseAdmin
      .from('campaign_events')
      .delete()
      .eq('campaign_id', campaignId)

    if (campaignEventsError) {
      console.error('Error deleting campaign events:', campaignEventsError)
      // Don't fail - continue with deletion
    }

    // 2. Delete articles associated with this campaign
    const { error: articlesError } = await supabaseAdmin
      .from('articles')
      .delete()
      .eq('campaign_id', campaignId)

    if (articlesError) {
      console.error('Error deleting campaign articles:', articlesError)
      // Don't fail - continue with deletion
    }

    // 3. Delete RSS posts associated with this campaign
    const { error: postsError } = await supabaseAdmin
      .from('rss_posts')
      .delete()
      .eq('campaign_id', campaignId)

    if (postsError) {
      console.error('Error deleting RSS posts:', postsError)
      // Don't fail - continue with deletion
    }

    // 4. Delete road work data associated with this campaign
    const { error: roadWorkError } = await supabaseAdmin
      .from('road_work_data')
      .delete()
      .eq('campaign_id', campaignId)

    if (roadWorkError) {
      console.error('Error deleting road work data:', roadWorkError)
      // Don't fail - continue with deletion
    }

    // 4b. Delete road work selections associated with this campaign
    const { error: roadWorkSelectionsError } = await supabaseAdmin
      .from('road_work_selections')
      .delete()
      .eq('campaign_id', campaignId)

    if (roadWorkSelectionsError) {
      console.error('Error deleting road work selections:', roadWorkSelectionsError)
      // Don't fail - continue with deletion
    }

    // 5. Delete user activities related to this campaign
    const { error: activitiesError } = await supabaseAdmin
      .from('user_activities')
      .delete()
      .eq('campaign_id', campaignId)

    if (activitiesError) {
      console.error('Error deleting user activities:', activitiesError)
      // Don't fail - continue with deletion
    }

    // 6. Delete archived articles associated with this campaign
    const { error: archivedArticlesError } = await supabaseAdmin
      .from('archived_articles')
      .delete()
      .eq('campaign_id', campaignId)

    if (archivedArticlesError) {
      console.error('Error deleting archived articles:', archivedArticlesError)
      // Don't fail - continue with deletion
    }

    // 7. Delete archived RSS posts associated with this campaign
    const { error: archivedPostsError } = await supabaseAdmin
      .from('archived_rss_posts')
      .delete()
      .eq('campaign_id', campaignId)

    if (archivedPostsError) {
      console.error('Error deleting archived RSS posts:', archivedPostsError)
      // Don't fail - continue with deletion
    }

    // Finally delete the campaign itself
    const { error: deleteError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .delete()
      .eq('id', campaignId)

    if (deleteError) {
      console.error('Error deleting campaign:', deleteError)
      console.error('Delete error details:', JSON.stringify(deleteError, null, 2))
      return NextResponse.json(
        {
          error: 'Failed to delete campaign',
          details: deleteError.message || 'Unknown database error',
          code: deleteError.code || 'UNKNOWN'
        },
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