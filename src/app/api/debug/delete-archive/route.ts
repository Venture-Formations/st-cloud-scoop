import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Delete Archive Endpoint
 * Used to delete archives before re-archiving with updated data
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

    console.log(`[DELETE ARCHIVE] Deleting archive for campaign: ${campaignId}`)

    // Delete the archive
    const { error } = await supabaseAdmin
      .from('archived_newsletters')
      .delete()
      .eq('campaign_id', campaignId)

    if (error) {
      return NextResponse.json({
        success: false,
        error: 'Failed to delete archive',
        details: error.message
      }, { status: 500 })
    }

    console.log(`[DELETE ARCHIVE] ✓ Successfully deleted archive for campaign ${campaignId}`)

    return NextResponse.json({
      success: true,
      message: 'Archive deleted successfully',
      campaign_id: campaignId
    })

  } catch (error) {
    console.error('[DELETE ARCHIVE] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete archive',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
