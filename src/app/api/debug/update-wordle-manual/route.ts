import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    console.log('Manual Wordle database update...')

    const body = await request.json()
    const { date = '2025-09-24' } = body

    // Only confirmed Wordle words - DO NOT add future dates or unconfirmed words
    const wordleData = [
      {
        date: '2025-09-25',
        word: 'DRAPE',
        definition: 'To cover, dress, or hang with cloth or fabric in graceful folds.',
        interesting_fact: 'The word "drape" comes from French "draper," meaning "to weave" or "make cloth." Medieval drapers were important merchants who sold fine fabrics.'
      }
    ]

    // Upsert all data
    const { data, error } = await supabaseAdmin
      .from('wordle')
      .upsert(wordleData, {
        onConflict: 'date'
      })
      .select()

    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }

    console.log('Wordle data updated successfully:', data?.length, 'records')

    return NextResponse.json({
      success: true,
      message: 'Wordle data updated in database',
      records: data?.length || 0,
      wordleData: wordleData.map(w => ({ date: w.date, word: w.word }))
    })

  } catch (error) {
    console.error('Manual Wordle update failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Manual Wordle update failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}