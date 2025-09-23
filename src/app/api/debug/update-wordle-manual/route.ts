import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    console.log('Manual Wordle database update...')

    const body = await request.json()
    const { date = '2025-09-24' } = body

    // Wordle data for recent dates - Wednesday Sep 24 newsletter shows Sep 23 Wordle
    const wordleData = [
      {
        date: '2025-09-22',
        word: 'BLEND',
        definition: 'To mix together thoroughly and inseparably.',
        interesting_fact: 'The word "blend" originally meant "to deceive" in Old Norse, but evolved to mean "mixing" by the 14th century.'
      },
      {
        date: '2025-09-23',
        word: 'TOAST',
        definition: 'Sliced bread browned by exposure to radiant heat.',
        interesting_fact: 'The word "toast" comes from the Latin "torrere," meaning "to parch." The French "toster" evolved into our modern word.'
      },
      {
        date: '2025-09-24',
        word: 'PLANT',
        definition: 'A living organism that grows in the earth and has a stem, leaves, and roots.',
        interesting_fact: 'Plants produce oxygen through photosynthesis, generating about 330 billion tons of oxygen annually - enough for all life on Earth.'
      },
      {
        date: '2025-09-25',
        word: 'MUSIC',
        definition: 'Vocal or instrumental sounds combined in such a way as to produce beauty of form, harmony, and expression of emotion.',
        interesting_fact: 'The word "music" derives from the Greek "mousike," meaning "art of the Muses" - the nine goddesses who inspired the arts.'
      },
      {
        date: '2025-09-26',
        word: 'CRANE',
        definition: 'A large, tall machine used for moving heavy objects by suspending them from a projecting arm.',
        interesting_fact: 'Construction cranes are named after the bird because their silhouette resembles a crane\'s long neck and beak when extended.'
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