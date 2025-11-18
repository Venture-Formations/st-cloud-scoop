import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Recalculate total_score for all post_ratings using multi-criteria weighted system
 * This fixes scores that were calculated with the old fixed-criteria system
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Recalculate Scores] Starting total_score recalculation for all ratings...')

    // Get all post_ratings
    const { data: ratings, error: ratingsError } = await supabaseAdmin
      .from('post_ratings')
      .select('*')
      .order('created_at', { ascending: false })

    if (ratingsError) {
      throw new Error(`Failed to fetch ratings: ${ratingsError.message}`)
    }

    if (!ratings || ratings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No ratings found',
        updated: 0
      })
    }

    console.log(`[Recalculate Scores] Found ${ratings.length} ratings to process`)

    let successCount = 0
    let skipCount = 0
    let errorCount = 0
    const results: any[] = []

    // Process each rating
    for (const rating of ratings) {
      try {
        // Calculate weighted total from criteria scores
        let calculatedTotal = 0
        let hasCriteria = false

        // Check criteria 1-5
        for (let i = 1; i <= 5; i++) {
          const score = rating[`criteria_${i}_score`]
          const weight = rating[`criteria_${i}_weight`]

          if (score !== null && score !== undefined && weight !== null && weight !== undefined) {
            calculatedTotal += score * weight
            hasCriteria = true
          }
        }

        // Skip if no criteria scores found
        if (!hasCriteria) {
          console.log(`[Recalculate Scores] Rating ${rating.id} has no criteria scores, skipping`)
          skipCount++
          continue
        }

        // Check if total_score needs updating
        const currentTotal = rating.total_score || 0
        const tolerance = 0.01 // Allow for small floating point differences

        if (Math.abs(currentTotal - calculatedTotal) < tolerance) {
          console.log(`[Recalculate Scores] Rating ${rating.id} already has correct total_score (${currentTotal}), skipping`)
          skipCount++
          continue
        }

        console.log(`[Recalculate Scores] Rating ${rating.id}: ${currentTotal} → ${calculatedTotal}`)

        // Update total_score
        const { error: updateError } = await supabaseAdmin
          .from('post_ratings')
          .update({ total_score: calculatedTotal })
          .eq('id', rating.id)

        if (updateError) {
          throw new Error(`Update failed: ${updateError.message}`)
        }

        successCount++
        results.push({
          rating_id: rating.id,
          post_id: rating.post_id,
          old_total: currentTotal,
          new_total: calculatedTotal,
          status: 'success'
        })

      } catch (error) {
        errorCount++
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Recalculate Scores] Error processing rating ${rating.id}:`, errorMsg)

        results.push({
          rating_id: rating.id,
          post_id: rating.post_id,
          status: 'error',
          error: errorMsg
        })
      }
    }

    console.log(`\n[Recalculate Scores] Complete: ${successCount} updated, ${skipCount} skipped, ${errorCount} errors`)

    return NextResponse.json({
      success: true,
      message: `Recalculation complete: ${successCount} updated, ${skipCount} skipped, ${errorCount} errors`,
      stats: {
        total: ratings.length,
        updated: successCount,
        skipped: skipCount,
        errors: errorCount
      },
      results: results.slice(0, 50) // Return first 50 results for debugging
    })

  } catch (error) {
    console.error('[Recalculate Scores] Error:', error)
    return NextResponse.json({
      error: 'Recalculation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
