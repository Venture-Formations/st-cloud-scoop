import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    // Get top 10 rated posts from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: posts, error } = await supabaseAdmin
      .from('rss_posts')
      .select(`
        id,
        title,
        description,
        content,
        published_at,
        created_at,
        feed_name,
        post_rating:post_ratings(total_score)
      `)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(100) // Get more to filter and sort by score

    if (error) {
      console.error('Failed to load RSS posts:', error)
      return NextResponse.json(
        { error: 'Failed to load RSS posts' },
        { status: 500 }
      )
    }

    // Filter posts that have ratings and sort by total_score
    const ratedPosts = (posts || [])
      .filter(post => post.post_rating && post.post_rating.length > 0)
      .map(post => ({
        id: post.id,
        title: post.title,
        description: post.description,
        content: post.content,
        published_at: post.published_at,
        created_at: post.created_at,
        feed_name: post.feed_name,
        total_score: post.post_rating[0]?.total_score || 0
      }))
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, 10) // Top 10

    return NextResponse.json({
      success: true,
      posts: ratedPosts,
      count: ratedPosts.length
    })

  } catch (error) {
    console.error('Error loading RSS posts:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
