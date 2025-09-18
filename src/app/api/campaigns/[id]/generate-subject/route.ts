import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { AI_PROMPTS, callOpenAI } from '@/lib/openai'
import { authOptions } from '@/lib/auth'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Fetch campaign with active articles
    const { data: campaign, error } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select(`
        *,
        articles:articles(
          headline,
          content,
          is_active,
          rss_post:rss_posts(
            post_rating:post_ratings(total_score)
          )
        )
      `)
      .eq('id', id)
      .single()

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get active articles sorted by rating (highest first)
    const activeArticles = campaign.articles
      .filter((article: any) => article.is_active)
      .sort((a: any, b: any) => {
        const scoreA = a.rss_post?.post_rating?.[0]?.total_score || 0
        const scoreB = b.rss_post?.post_rating?.[0]?.total_score || 0
        return scoreB - scoreA
      })

    if (activeArticles.length === 0) {
      return NextResponse.json({
        error: 'No active articles found for subject line generation'
      }, { status: 400 })
    }

    console.log(`Generating subject line for ${activeArticles.length} articles`)

    // Generate subject line using AI
    const prompt = AI_PROMPTS.subjectLineGenerator(activeArticles)
    const result = await callOpenAI(prompt)

    if (!result.subject_line) {
      throw new Error('Invalid subject line response from AI')
    }

    // Update campaign with generated subject line
    const { error: updateError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .update({
        subject_line: result.subject_line
      })
      .eq('id', id)

    if (updateError) {
      console.error('Failed to update campaign with subject line:', updateError)
      // Continue anyway - we still return the generated subject line
    }

    console.log(`Generated subject line: "${result.subject_line}" (${result.character_count} chars)`)

    // Log user activity
    if (session.user?.email) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', session.user.email)
        .single()

      if (user) {
        await supabaseAdmin
          .from('user_activities')
          .insert([{
            user_id: user.id,
            campaign_id: id,
            action: 'subject_line_generated',
            details: {
              subject_line: result.subject_line,
              character_count: result.character_count,
              articles_count: activeArticles.length
            }
          }])
      }
    }

    return NextResponse.json({
      success: true,
      subject_line: result.subject_line,
      character_count: result.character_count,
      articles_used: activeArticles.length
    })

  } catch (error) {
    console.error('Failed to generate subject line:', error)
    return NextResponse.json({
      error: 'Failed to generate subject line',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}