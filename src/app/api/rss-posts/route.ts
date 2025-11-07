import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')

    const { data: posts, error } = await supabaseAdmin
      .from('rss_posts')
      .select('id, title, description, content, published_at, created_at, feed_name')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Failed to load RSS posts:', error)
      return NextResponse.json(
        { error: 'Failed to load RSS posts' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      posts: posts || [],
      count: posts?.length || 0
    })

  } catch (error) {
    console.error('Error loading RSS posts:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
