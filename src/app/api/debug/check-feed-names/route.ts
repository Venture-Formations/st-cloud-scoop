import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    // Get all RSS feeds
    const { data: feeds, error } = await supabaseAdmin
      .from('rss_feeds')
      .select('id, name, active, feed_url')
      .order('name')

    if (error) {
      throw error
    }

    // Get a sample article to check what's being stored
    const { data: sampleArticles } = await supabaseAdmin
      .from('articles')
      .select(`
        id,
        headline,
        rss_post:rss_posts (
          rss_feed:rss_feeds (
            id,
            name
          )
        )
      `)
      .limit(3)

    const sampleFeedInfo = sampleArticles?.[0]?.rss_post as any

    return NextResponse.json({
      success: true,
      feeds: feeds || [],
      sample_article_feed: sampleFeedInfo?.rss_feed || null,
      sample_articles: sampleArticles?.map(a => ({
        headline: a.headline,
        feed_name: (a.rss_post as any)?.rss_feed?.name || 'No feed'
      }))
    })

  } catch (error) {
    console.error('Error checking feed names:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}