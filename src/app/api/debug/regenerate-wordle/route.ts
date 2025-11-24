import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { AI_PROMPTS } from '@/lib/openai'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date') || '2025-11-17'
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]
    const dryRun = searchParams.get('dry_run') === 'true'

    console.log(`[REGENERATE-WORDLE] Fetching wordle data from ${startDate} to ${endDate}`)

    // Fetch wordle data for the date range
    const { data: wordleData, error: fetchError } = await supabaseAdmin
      .from('wordle_data')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (fetchError) {
      throw fetchError
    }

    if (!wordleData || wordleData.length === 0) {
      return NextResponse.json({
        success: false,
        error: `No wordle data found between ${startDate} and ${endDate}`
      })
    }

    console.log(`[REGENERATE-WORDLE] Found ${wordleData.length} wordle entries to update`)

    const results: any[] = []

    for (const entry of wordleData) {
      const word = entry.word
      console.log(`[REGENERATE-WORDLE] Processing ${entry.date}: ${word}`)

      try {
        // Generate new definition using the updated prompt
        const newDefinition = await AI_PROMPTS.wordleDefinition(word)

        // Generate new interesting fact using the updated prompt
        const newFact = await AI_PROMPTS.wordleFact(word)

        const result: Record<string, any> = {
          date: entry.date,
          word: word,
          old_definition: entry.definition,
          new_definition: newDefinition,
          old_fact: entry.interesting_fact,
          new_fact: newFact
        }

        if (!dryRun) {
          // Update the database
          const { error: updateError } = await supabaseAdmin
            .from('wordle_data')
            .update({
              definition: newDefinition,
              interesting_fact: newFact,
              updated_at: new Date().toISOString()
            })
            .eq('id', entry.id)

          if (updateError) {
            result.update_error = updateError.message
          } else {
            result.updated = true
          }
        } else {
          result.dry_run = true
        }

        results.push(result)
        console.log(`[REGENERATE-WORDLE] Completed ${entry.date}: ${word}`)

      } catch (err) {
        results.push({
          date: entry.date,
          word: word,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
        console.error(`[REGENERATE-WORDLE] Error processing ${entry.date}:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      message: dryRun
        ? `Dry run complete for ${results.length} entries`
        : `Updated ${results.filter(r => r.updated).length} of ${results.length} entries`,
      start_date: startDate,
      end_date: endDate,
      dry_run: dryRun,
      results
    })

  } catch (error) {
    console.error('[REGENERATE-WORDLE] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
