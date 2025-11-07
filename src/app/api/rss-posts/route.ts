import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    // Get most recent rated posts (no time limit, just get latest with ratings)
    const { data: posts, error } = await supabaseAdmin
      .from('rss_posts')
      .select(`
        id,
        title,
        description,
        content,
        published_at,
        processed_at,
        post_rating:post_ratings(total_score)
      `)
      .order('processed_at', { ascending: false })
      .limit(100) // Get recent 100 posts to filter and sort by score

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
        processed_at: post.processed_at,
        total_score: post.post_rating[0]?.total_score || 0
      }))
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, 10) // Top 10

    console.log('[RSS-POSTS] Found:', {
      total_posts: posts?.length || 0,
      posts_with_ratings: ratedPosts.length,
      top_scores: ratedPosts.slice(0, 3).map(p => p.total_score)
    })

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
