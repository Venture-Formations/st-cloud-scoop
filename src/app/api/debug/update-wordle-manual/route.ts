import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    console.log('Manual Wordle database update...')

    const body = await request.json()
    const { date = '2025-09-24' } = body

    // Actual Wordle words for recent dates - verified from spoiler sources
    const wordleData = [
      {
        date: '2025-09-22',
        word: 'ROUND',
        definition: 'Having a curved shape that is circular or approximately circular.',
        interesting_fact: 'The word "round" comes from Old French "roond," derived from Latin "rotundus," meaning circular like a wheel.'
      },
      {
        date: '2025-09-23',
        word: 'SHIRT',
        definition: 'A garment for the upper body, typically having a collar and sleeves.',
        interesting_fact: 'The word "shirt" comes from Old English "scyrte," related to "short," originally referring to a short tunic.'
      },
      {
        date: '2025-09-24',
        word: 'FLING',
        definition: 'To throw or move forcefully or carelessly.',
        interesting_fact: 'The word "fling" comes from Middle English, possibly of Scandinavian origin, related to Old Norse "flengja" meaning to whip.'
      },
      {
        date: '2025-09-25',
        word: 'DRAPE',
        definition: 'To cover, dress, or hang with cloth or fabric in graceful folds.',
        interesting_fact: 'The word "drape" comes from French "draper," meaning "to weave" or "make cloth." Medieval drapers were important merchants who sold fine fabrics.'
      },
      {
        date: '2025-09-26',
        word: 'PLUMB',
        definition: 'Exactly vertical or perpendicular; to measure the depth of water.',
        interesting_fact: 'The word "plumb" comes from Latin "plumbum" meaning lead, referring to the lead weight used in plumb lines for measuring verticality.'
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