import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaign_id')

    if (!campaignId) {
      return NextResponse.json({ error: 'campaign_id parameter required' }, { status: 400 })
    }

    console.log('=== TESTING POSITION LOGGING ===')
    console.log('Campaign ID:', campaignId)

    // Fetch campaign with articles (same query as send-review route)
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
      .eq('id', campaignId)
      .single()

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    console.log('Campaign found:', campaign.id, 'Status:', campaign.status)
    console.log('Total articles:', campaign.articles?.length || 0)
    console.log('Total manual articles:', campaign.manual_articles?.length || 0)

    // Get active articles sorted by rank (same logic as send-review route)
    const activeArticles = campaign.articles
      .filter((article: any) => article.is_active)
      .sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999))
      .slice(0, 5) // Only log positions 1-5

    const activeManualArticles = campaign.manual_articles
      .filter((article: any) => article.is_active)
      .sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999))
      .slice(0, 5) // Only log positions 1-5

    console.log('Active articles for position logging:', activeArticles.length)
    console.log('Active manual articles for position logging:', activeManualArticles.length)

    const results = {
      campaign_id: campaignId,
      campaign_status: campaign.status,
      total_articles: campaign.articles?.length || 0,
      total_manual_articles: campaign.manual_articles?.length || 0,
      active_articles: activeArticles.length,
      active_manual_articles: activeManualArticles.length,
      article_updates: [] as any[],
      manual_article_updates: [] as any[],
      errors: [] as any[]
    }

    // Test updating review positions for regular articles
    for (let i = 0; i < activeArticles.length; i++) {
      const position = i + 1
      const article = activeArticles[i]

      console.log(`Attempting to set position ${position} for article ID ${article.id}: ${article.headline}`)

      const { error: updateError } = await supabaseAdmin
        .from('articles')
        .update({ review_position: position })
        .eq('id', article.id)

      if (updateError) {
        console.error(`Failed to update review position for article ${article.id}:`, updateError)
        results.errors.push({
          type: 'article_update_error',
          article_id: article.id,
          position: position,
          error: updateError.message
        })
      } else {
        console.log(`✅ Successfully set review position ${position} for article: ${article.headline}`)
        results.article_updates.push({
          article_id: article.id,
          position: position,
          headline: article.headline,
          success: true
        })
      }
    }

    // Test updating review positions for manual articles
    for (let i = 0; i < activeManualArticles.length; i++) {
      const position = i + 1
      const article = activeManualArticles[i]

      console.log(`Attempting to set position ${position} for manual article ID ${article.id}: ${article.title}`)

      const { error: updateError } = await supabaseAdmin
        .from('manual_articles')
        .update({ review_position: position })
        .eq('id', article.id)

      if (updateError) {
        console.error(`Failed to update review position for manual article ${article.id}:`, updateError)
        results.errors.push({
          type: 'manual_article_update_error',
          article_id: article.id,
          position: position,
          error: updateError.message
        })
      } else {
        console.log(`✅ Successfully set review position ${position} for manual article: ${article.title}`)
        results.manual_article_updates.push({
          article_id: article.id,
          position: position,
          title: article.title,
          success: true
        })
      }
    }

    console.log('=== POSITION LOGGING TEST COMPLETE ===')

    // Verify the updates by querying the positions
    const { data: verifyArticles } = await supabaseAdmin
      .from('articles')
      .select('id, headline, review_position')
      .eq('campaign_id', campaignId)
      .eq('is_active', true)
      .order('review_position', { ascending: true })

    const { data: verifyManualArticles } = await supabaseAdmin
      .from('manual_articles')
      .select('id, title, review_position')
      .eq('campaign_id', campaignId)
      .eq('is_active', true)
      .order('review_position', { ascending: true })

    results.verification = {
      articles_with_positions: verifyArticles?.filter(a => a.review_position !== null) || [],
      manual_articles_with_positions: verifyManualArticles?.filter(a => a.review_position !== null) || []
    }

    return NextResponse.json({
      success: results.errors.length === 0,
      results: results,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Position logging test error:', error)
    return NextResponse.json({
      error: 'Failed to test position logging',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}