import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { AI_PROMPTS, callOpenAI } from '@/lib/openai'

export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('=== AUTOMATED SUBJECT LINE GENERATION STARTED ===')
    console.log('Time:', new Date().toISOString())

    // Get today's campaign
    const today = new Date()
    const campaignDate = today.toISOString().split('T')[0]

    console.log('Generating subject line for campaign date:', campaignDate)

    // Find today's campaign
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select(`
        id,
        date,
        status,
        subject_line,
        articles:articles(
          headline,
          content,
          is_active,
          rss_post:rss_posts(
            post_rating:post_ratings(total_score)
          )
        )
      `)
      .eq('date', campaignDate)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({
        success: false,
        error: 'No campaign found for today',
        campaignDate: campaignDate
      }, { status: 404 })
    }

    console.log('Found campaign:', campaign.id, 'Status:', campaign.status)

    // Only generate if campaign is in draft status
    if (campaign.status !== 'draft') {
      return NextResponse.json({
        success: true,
        message: `Campaign status is ${campaign.status}, skipping subject line generation`,
        campaignId: campaign.id,
        skipped: true
      })
    }

    // Check if subject line already exists
    if (campaign.subject_line && campaign.subject_line.trim() !== '') {
      console.log('Subject line already exists:', campaign.subject_line)
      return NextResponse.json({
        success: true,
        message: 'Subject line already exists',
        campaignId: campaign.id,
        existingSubjectLine: campaign.subject_line,
        skipped: true
      })
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
        success: false,
        error: 'No active articles found for subject line generation',
        campaignId: campaign.id
      }, { status: 400 })
    }

    // Use only the highest scored article
    const topArticle = activeArticles[0]
    console.log(`Generating subject line based on top article: "${topArticle.headline}" (score: ${topArticle.rss_post?.post_rating?.[0]?.total_score || 0})`)

    // Generate subject line using AI with just the top article
    const prompt = AI_PROMPTS.subjectLineGenerator([topArticle])
    const result = await callOpenAI(prompt, 1000, 0.8)

    if (!result.subject_line) {
      throw new Error('Invalid subject line response from AI')
    }

    console.log(`Generated subject line: "${result.subject_line}" (${result.character_count} chars)`)

    // Update campaign with generated subject line
    const { error: updateError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .update({
        subject_line: result.subject_line
      })
      .eq('id', campaign.id)

    if (updateError) {
      throw new Error(`Failed to update campaign: ${updateError.message}`)
    }

    console.log('=== SUBJECT LINE GENERATION COMPLETED ===')

    return NextResponse.json({
      success: true,
      message: 'Subject line generated successfully',
      campaignId: campaign.id,
      campaignDate: campaignDate,
      subjectLine: result.subject_line,
      characterCount: result.character_count,
      topArticleUsed: topArticle.headline,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('=== SUBJECT LINE GENERATION FAILED ===')
    console.error('Error:', error)

    return NextResponse.json({
      success: false,
      error: 'Subject line generation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// Also allow GET for manual testing
export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams
  const secret = searchParams.get('secret')

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Create a fake POST request for processing
  const fakeRequest = new Request(request.url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${process.env.CRON_SECRET}`
    }
  })

  return POST(fakeRequest as NextRequest)
}