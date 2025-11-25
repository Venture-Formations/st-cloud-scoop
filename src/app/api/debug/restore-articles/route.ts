import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Restore articles from archived newsletter data
 * GET /api/debug/restore-articles?campaign_id=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaign_id')

    if (!campaignId) {
      return NextResponse.json({ error: 'Missing campaign_id parameter' }, { status: 400 })
    }

    // Get archived newsletter for this campaign
    const { data: archive, error: archiveError } = await supabaseAdmin
      .from('archived_newsletters')
      .select('articles')
      .eq('campaign_id', campaignId)
      .single()

    if (archiveError || !archive) {
      return NextResponse.json({
        error: 'Archive not found',
        details: archiveError?.message
      }, { status: 404 })
    }

    const archivedArticles = archive.articles || []
    if (archivedArticles.length === 0) {
      return NextResponse.json({ error: 'No articles in archive' }, { status: 400 })
    }

    console.log(`[RESTORE] Found ${archivedArticles.length} articles in archive`)

    // Restore each article
    const articlesToRestore = archivedArticles.map((article: any, index: number) => ({
      id: article.id,
      campaign_id: campaignId,
      headline: article.headline,
      content: article.content,
      word_count: article.word_count || 0,
      rank: article.final_position || index + 1,
      final_position: article.final_position || index + 1,
      is_active: true,
      skipped: false
    }))

    const { data: restored, error: restoreError } = await supabaseAdmin
      .from('articles')
      .upsert(articlesToRestore, { onConflict: 'id' })
      .select()

    if (restoreError) {
      console.error('[RESTORE] Error:', restoreError)
      return NextResponse.json({
        error: 'Failed to restore articles',
        details: restoreError.message
      }, { status: 500 })
    }

    // Verify restoration
    const { data: verification } = await supabaseAdmin
      .from('articles')
      .select('id, headline, rank, is_active')
      .eq('campaign_id', campaignId)
      .order('rank', { ascending: true })

    return NextResponse.json({
      success: true,
      message: `Restored ${restored?.length || 0} articles`,
      articles: verification
    })

  } catch (error) {
    console.error('[RESTORE] Error:', error)
    return NextResponse.json({
      error: 'Failed to restore articles',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
