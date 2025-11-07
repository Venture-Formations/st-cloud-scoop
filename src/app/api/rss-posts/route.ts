import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    // Get recent RSS posts
    const { data: posts, error: postsError } = await supabaseAdmin
      .from('rss_posts')
      .select('id, title, description, content, publication_date, processed_at')
      .order('processed_at', { ascending: false })
      .limit(100)

    if (postsError) {
      console.error('Failed to load RSS posts:', postsError)
      return NextResponse.json(
        { error: 'Failed to load RSS posts' },
        { status: 500 }
      )
    }

    // Get all ratings for these posts
    const postIds = posts?.map(p => p.id) || []
    const { data: ratings, error: ratingsError } = await supabaseAdmin
      .from('post_ratings')
      .select('post_id, total_score')
      .in('post_id', postIds)

    if (ratingsError) {
      console.error('Failed to load ratings:', ratingsError)
      return NextResponse.json(
        { error: 'Failed to load ratings' },
        { status: 500 }
      )
    }

    // Create a map of post_id -> total_score
    const ratingsMap = new Map(
      (ratings || []).map(r => [r.post_id, r.total_score])
    )

    // Combine posts with their ratings
    const ratedPosts = (posts || [])
      .filter(post => ratingsMap.has(post.id))
      .map(post => ({
        id: post.id,
        title: post.title,
        description: post.description,
        content: post.content,
        publication_date: post.publication_date,
        processed_at: post.processed_at,
        total_score: ratingsMap.get(post.id) || 0
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
