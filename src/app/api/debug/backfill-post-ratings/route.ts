import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { callAIWithPrompt } from '@/lib/openai'

/**
 * Backfill ratings for posts that don't have them
 * This is a one-time fix for posts that were ingested before the rating system was working
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')
    const limit = parseInt(searchParams.get('limit') || '10')

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Backfill Ratings] Starting backfill process...')

    // Get posts without ratings
    const { data: posts, error: postsError } = await supabaseAdmin
      .from('rss_posts')
      .select('id, title, description, content, processed_at')
      .order('processed_at', { ascending: false })
      .limit(limit)

    if (postsError) {
      throw new Error(`Failed to fetch posts: ${postsError.message}`)
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No posts found to rate',
        rated: 0
      })
    }

    // Check which posts already have ratings
    const postIds = posts.map(p => p.id)
    const { data: existingRatings } = await supabaseAdmin
      .from('post_ratings')
      .select('post_id')
      .in('post_id', postIds)

    const ratedPostIds = new Set((existingRatings || []).map(r => r.post_id))
    const unratedPosts = posts.filter(p => !ratedPostIds.has(p.id))

    console.log(`[Backfill Ratings] Found ${unratedPosts.length} unrated posts out of ${posts.length} total`)

    if (unratedPosts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All posts already have ratings',
        rated: 0,
        checked: posts.length
      })
    }

    // Rate each unrated post
    let successCount = 0
    let failCount = 0
    const results = []

    for (const post of unratedPosts) {
      try {
        await scorePost(post)
        successCount++
        results.push({
          post_id: post.id,
          title: post.title,
          status: 'success'
        })
        console.log(`[Backfill Ratings] Rated: ${post.title}`)
      } catch (error) {
        failCount++
        results.push({
          post_id: post.id,
          title: post.title,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        console.error(`[Backfill Ratings] Failed to rate ${post.title}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Backfill complete: ${successCount} rated, ${failCount} failed`,
      stats: {
        checked: posts.length,
        already_rated: ratedPostIds.size,
        newly_rated: successCount,
        failed: failCount
      },
      results
    })

  } catch (error) {
    console.error('[Backfill Ratings] Error:', error)
    return NextResponse.json({
      error: 'Backfill failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Score a post using multi-criteria AI
 * (Copied from ingest-rss route)
 */
async function scorePost(post: any) {
  // Helper to extract value from JSONB or plain text
  const extractValue = (value: any): string => {
    if (typeof value === 'string') return value
    if (typeof value === 'object' && value !== null) return String(value.text || value.value || value)
    return String(value)
  }

  // Get criteria configuration
  const { data: criteriaCountData } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'criteria_enabled_count')
    .single()

  const criteriaCount = criteriaCountData ? parseInt(extractValue(criteriaCountData.value)) : 0

  if (criteriaCount === 0) {
    console.log('[Backfill Ratings] Multi-criteria scoring not configured, skipping scoring')
    return
  }

  // Fetch criteria settings
  const { data: criteriaSettings } = await supabaseAdmin
    .from('app_settings')
    .select('key, value')
    .or('key.like.criteria_%_name,key.like.criteria_%_weight,key.like.criteria_%_enabled')

  if (!criteriaSettings) {
    throw new Error('Failed to load criteria configuration')
  }

  // Build criteria array
  const criteria: Array<{ number: number; name: string; weight: number }> = []
  for (let i = 1; i <= criteriaCount; i++) {
    const nameKey = `criteria_${i}_name`
    const weightKey = `criteria_${i}_weight`
    const enabledKey = `criteria_${i}_enabled`

    const nameSetting = criteriaSettings.find(s => s.key === nameKey)
    const weightSetting = criteriaSettings.find(s => s.key === weightKey)
    const enabledSetting = criteriaSettings.find(s => s.key === enabledKey)

    const name = nameSetting ? extractValue(nameSetting.value) : `Criterion ${i}`
    const weight = weightSetting ? parseFloat(extractValue(weightSetting.value)) : 1.0
    const enabled = enabledSetting ? extractValue(enabledSetting.value) !== 'false' : true

    if (enabled) {
      criteria.push({ number: i, name, weight })
    }
  }

  console.log(`[Backfill Ratings] Scoring with ${criteria.length} criteria`)

  // Evaluate each criterion
  const criteriaScores: Array<{ score: number; reason: string; weight: number }> = []

  for (const criterion of criteria) {
    const responseText = await callAIWithPrompt(
      `ai_prompt_criteria_${criterion.number}`,
      {
        title: post.title,
        description: post.description || '',
        content: post.content || post.description || ''
      }
    )

    let result
    try {
      result = JSON.parse(responseText as string)
    } catch (e) {
      console.error(`Failed to parse JSON response for criterion ${criterion.number}:`, responseText)
      throw new Error(`Invalid JSON response from criterion ${criterion.number}`)
    }

    if (typeof result.score !== 'number' || result.score < 0 || result.score > 10) {
      throw new Error(`Invalid score from criterion ${criterion.number}: ${result.score}`)
    }

    criteriaScores.push({
      score: result.score,
      reason: result.reason || 'No reason provided',
      weight: criterion.weight
    })
  }

  // Calculate weighted total score
  let totalWeightedScore = 0
  criteriaScores.forEach(({ score, weight }) => {
    totalWeightedScore += score * weight
  })

  // Insert rating
  const ratingRecord: any = {
    post_id: post.id,
    total_score: totalWeightedScore
  }

  // Add multi-criteria fields
  criteriaScores.forEach((criterionScore, index) => {
    const criterionNum = index + 1
    ratingRecord[`criteria_${criterionNum}_score`] = criterionScore.score
    ratingRecord[`criteria_${criterionNum}_reason`] = criterionScore.reason
    ratingRecord[`criteria_${criterionNum}_weight`] = criterionScore.weight
  })

  await supabaseAdmin
    .from('post_ratings')
    .insert(ratingRecord)
}
