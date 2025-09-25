import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { authOptions } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: articleId } = await params

    // Get the article to verify it exists (don't select skipped column in case it doesn't exist)
    const { data: article, error: articleError } = await supabaseAdmin
      .from('articles')
      .select('id, campaign_id, headline')
      .eq('id', articleId)
      .single()

    if (articleError || !article) {
      console.error('Article query error:', articleError)
      return NextResponse.json({
        error: 'Article not found',
        details: articleError?.message || 'Article does not exist'
      }, { status: 404 })
    }

    // Mark article as skipped
    const { error: updateError } = await supabaseAdmin
      .from('articles')
      .update({
        skipped: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', articleId)

    if (updateError) {
      console.error('Failed to skip article:', updateError)

      // Provide helpful error message if column doesn't exist
      if (updateError.message?.includes('column "skipped" of relation "articles" does not exist')) {
        return NextResponse.json({
          error: 'Database setup required',
          details: 'The skipped column needs to be added to the database. Please run: /api/debug/add-skip-column',
          sqlCommand: 'ALTER TABLE articles ADD COLUMN skipped BOOLEAN DEFAULT FALSE;'
        }, { status: 500 })
      }

      return NextResponse.json({
        error: 'Failed to skip article',
        details: updateError.message
      }, { status: 500 })
    }

    // Log the skip action
    try {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', session.user?.email)
        .single()

      if (user) {
        await supabaseAdmin
          .from('user_activities')
          .insert([{
            user_id: user.id,
            action: 'article_skipped',
            details: {
              article_id: articleId,
              campaign_id: article.campaign_id,
              article_headline: article.headline,
              skipped_by: session.user?.email,
              skipped_at: new Date().toISOString()
            }
          }])
      }
    } catch (logError) {
      console.error('Failed to log article skip action:', logError)
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      success: true,
      message: 'Article skipped successfully',
      article: {
        id: articleId,
        skipped: true
      }
    })

  } catch (error) {
    console.error('Article skip failed:', error)
    return NextResponse.json({
      error: 'Failed to skip article',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}