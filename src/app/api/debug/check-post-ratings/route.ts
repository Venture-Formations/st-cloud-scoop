import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    // Count total RSS posts
    const { count: totalPosts, error: postsError } = await supabaseAdmin
      .from('rss_posts')
      .select('*', { count: 'exact', head: true })

    if (postsError) {
      console.error('Error counting posts:', postsError)
    }

    // Count posts with ratings
    const { count: totalRatings, error: ratingsError } = await supabaseAdmin
      .from('post_ratings')
      .select('*', { count: 'exact', head: true })

    if (ratingsError) {
      console.error('Error counting ratings:', ratingsError)
    }

    // Get recent posts (last 10)
    const { data: recentPosts, error: recentPostsError } = await supabaseAdmin
      .from('rss_posts')
      .select('id, title, processed_at')
      .order('processed_at', { ascending: false })
      .limit(10)

    if (recentPostsError) {
      console.error('Error fetching recent posts:', recentPostsError)
    }

    // Check which recent posts have ratings
    const postIds = recentPosts?.map(p => p.id) || []
    const { data: ratingsForRecent, error: ratingsForRecentError } = await supabaseAdmin
      .from('post_ratings')
      .select('post_id, total_score')
      .in('post_id', postIds)

    if (ratingsForRecentError) {
      console.error('Error fetching ratings for recent posts:', ratingsForRecentError)
    }

    const ratingsMap = new Map(
      (ratingsForRecent || []).map(r => [r.post_id, r.total_score])
    )

    const recentPostsWithRatingStatus = recentPosts?.map(post => ({
      id: post.id,
      title: post.title,
      processed_at: post.processed_at,
      has_rating: ratingsMap.has(post.id),
      total_score: ratingsMap.get(post.id) || null
    }))

    return NextResponse.json({
      success: true,
      totals: {
        total_posts: totalPosts,
        total_ratings: totalRatings,
        posts_without_ratings: (totalPosts || 0) - (totalRatings || 0)
      },
      recent_posts: recentPostsWithRatingStatus,
      errors: {
        posts: postsError?.message,
        ratings: ratingsError?.message,
        recent: recentPostsError?.message,
        ratingsForRecent: ratingsForRecentError?.message
      }
    })

  } catch (error) {
    console.error('Error checking post ratings:', error)
    return NextResponse.json({
      error: 'Failed to check post ratings',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
