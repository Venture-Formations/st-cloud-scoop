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
    const { data: sampleArticle } = await supabaseAdmin
      .from('articles')
      .select(`
        id,
        headline,
        rss_post:rss_posts!inner (
          rss_feed:rss_feeds!inner (
            id,
            name
          )
        )
      `)
      .limit(1)
      .single()

    return NextResponse.json({
      success: true,
      feeds: feeds || [],
      sample_article_feed: sampleArticle?.rss_post?.rss_feed || null
    })

  } catch (error) {
    console.error('Error checking feed names:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}