import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    // Check total RSS posts
    const { data: allPosts, error: postsError, count: totalCount } = await supabaseAdmin
      .from('rss_posts')
      .select('id, title, processed_at', { count: 'exact' })
      .order('processed_at', { ascending: false })
      .limit(10)

    // Check total post ratings
    const { data: allRatings, error: ratingsError, count: ratingsCount } = await supabaseAdmin
      .from('post_ratings')
      .select('id, post_id, total_score', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(10)

    // Check posts with ratings joined
    const { data: postsWithRatings, error: joinError } = await supabaseAdmin
      .from('rss_posts')
      .select(`
        id,
        title,
        processed_at,
        post_rating:post_ratings(total_score, created_at)
      `)
      .order('processed_at', { ascending: false })
      .limit(10)

    // Filter to only posts that have ratings
    const ratedPosts = (postsWithRatings || []).filter(
      post => post.post_rating && post.post_rating.length > 0
    )

    // Check if any sample rating post_ids exist in rss_posts
    const sampleRatingPostIds = allRatings?.slice(0, 5).map(r => r.post_id) || []
    const { data: matchingPosts } = await supabaseAdmin
      .from('rss_posts')
      .select('id, title')
      .in('id', sampleRatingPostIds)

    return NextResponse.json({
      success: true,
      totals: {
        rss_posts: totalCount,
        post_ratings: ratingsCount,
        posts_with_ratings: ratedPosts.length
      },
      sample_posts: allPosts?.slice(0, 5).map(p => ({
        id: p.id,
        title: p.title?.substring(0, 60),
        processed_at: p.processed_at
      })),
      sample_ratings: allRatings?.slice(0, 5).map(r => ({
        id: r.id,
        post_id: r.post_id,
        total_score: r.total_score
      })),
      sample_posts_with_ratings: ratedPosts.slice(0, 5).map(p => ({
        id: p.id,
        title: p.title?.substring(0, 60),
        rating_count: p.post_rating?.length || 0,
        total_score: p.post_rating?.[0]?.total_score
      })),
      errors: {
        posts: postsError?.message || null,
        ratings: ratingsError?.message || null,
        join: joinError?.message || null
      },
      diagnostics: {
        sample_rating_post_ids: sampleRatingPostIds,
        matching_posts_found: matchingPosts?.length || 0,
        matching_posts: matchingPosts || []
      }
    })

  } catch (error) {
    console.error('Error checking RSS posts:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
