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
          rank,
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

    // Get active articles sorted by rank (custom order, rank 1 = #1 position)
    const activeArticles = campaign.articles
      .filter((article: any) => article.is_active)
      .sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999))

    if (activeArticles.length === 0) {
      return NextResponse.json({
        error: 'No active articles found for subject line generation'
      }, { status: 400 })
    }

    // Use the #1 ranked article (rank 1) for subject line generation
    const topArticle = activeArticles[0]
    console.log(`Generating subject line based on #1 ranked article: "${topArticle.headline}" (rank: ${topArticle.rank || 'unranked'}, score: ${topArticle.rss_post?.post_rating?.[0]?.total_score || 0})`)
    console.log('Top article full content:', {
      headline: topArticle.headline,
      content: topArticle.content,
      content_length: topArticle.content?.length || 0
    })

    // Generate subject line using AI with just the top article
    // Add timestamp to prompt for variation each time
    const variationPrompt = AI_PROMPTS.subjectLineGenerator([topArticle]) +
      `\n\nGeneration timestamp: ${new Date().toISOString()} - Create a fresh, unique headline variation.`

    console.log('=== FULL PROMPT BEING SENT TO AI ===')
    console.log(variationPrompt)
    console.log('=== END PROMPT ===')

    // Use higher temperature for more creative variation
    const result = await callOpenAI(variationPrompt, 1000, 0.8)

    console.log('=== AI RESPONSE ===')
    console.log(result)
    console.log('=== END AI RESPONSE ===')

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
              top_article_headline: topArticle.headline,
              top_article_score: topArticle.rss_post?.post_rating?.[0]?.total_score || 0
            }
          }])
      }
    }

    return NextResponse.json({
      success: true,
      subject_line: result.subject_line,
      character_count: result.character_count,
      top_article_used: topArticle.headline,
      top_article_score: topArticle.rss_post?.post_rating?.[0]?.total_score || 0
    })

  } catch (error) {
    console.error('Failed to generate subject line:', error)
    return NextResponse.json({
      error: 'Failed to generate subject line',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}