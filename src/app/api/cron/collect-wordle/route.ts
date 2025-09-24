import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { callOpenAI } from '@/lib/openai'

// Create Wordle prompt function
function createWordlePrompt(date: string) {
  return `Find the Wordle answer for ${date}. Return ONLY a JSON array in this exact format:

[{
  "word": "WORD",
  "definition": "Brief definition",
  "interesting_fact": "One interesting fact about this word"
}]

Do not include any other text, markdown, or explanations. Just return the JSON array.`
}

async function collectWordleData(date: string) {
  console.log(`🧩 Collecting Wordle data for ${date}...`)

  // Check if we already have data for this date
  const { data: existing } = await supabaseAdmin
    .from('wordle')
    .select('*')
    .eq('date', date)
    .single()

  if (existing) {
    console.log(`✅ Wordle data already exists for ${date}`)
    return existing
  }

  // Generate the prompt for today's date
  const prompt = createWordlePrompt(date)

  // Call OpenAI with the prompt
  console.log('🤖 Calling OpenAI for Wordle data...')
  const aiResponse = await callOpenAI(prompt, 500, 0.7)

  // Parse the response
  let wordleData
  try {
    console.log('Raw AI Response:', aiResponse)
    console.log('AI Response Type:', typeof aiResponse)

    let responseArray

    // Handle different response types
    if (typeof aiResponse === 'object') {
      if (Array.isArray(aiResponse)) {
        responseArray = aiResponse
      } else if (aiResponse && typeof aiResponse === 'object') {
        // If it's an object but not an array, wrap it
        responseArray = [aiResponse]
      }
    } else if (typeof aiResponse === 'string') {
      // Clean the response of any markdown formatting
      const cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      responseArray = JSON.parse(cleanResponse)
    } else {
      throw new Error('Unexpected response type: ' + typeof aiResponse)
    }

    if (!Array.isArray(responseArray) || responseArray.length === 0) {
      throw new Error('Invalid response format - expected non-empty array')
    }

    // Take the first result
    wordleData = responseArray[0]

    if (!wordleData || !wordleData.word || !wordleData.definition || !wordleData.interesting_fact) {
      throw new Error('Missing required fields in Wordle data: ' + JSON.stringify(wordleData))
    }

    console.log('Successfully parsed Wordle data:', wordleData)

  } catch (error) {
    console.error('Failed to parse AI response:', error)
    console.error('Raw response:', aiResponse)
    console.error('Response type:', typeof aiResponse)
    throw new Error('Failed to parse Wordle data from AI response: ' + (error instanceof Error ? error.message : 'Unknown error'))
  }

  // Insert into database
  const { data: newWordle, error } = await supabaseAdmin
    .from('wordle')
    .insert([{
      date,
      word: wordleData.word.toUpperCase(),
      definition: wordleData.definition,
      interesting_fact: wordleData.interesting_fact
    }])
    .select()
    .single()

  if (error) {
    console.error('Failed to insert Wordle data:', error)
    throw new Error(`Database insertion failed: ${error.message}`)
  }

  console.log(`✅ Wordle data collected and stored for ${date}:`, newWordle.word)
  return newWordle
}

// POST handler for Vercel cron
export async function POST(request: NextRequest) {
  console.log('🧩 Starting automated Wordle collection cron job...')

  try {
    // Verify cron secret for security (only for POST/cron requests)
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log('❌ Unauthorized cron request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ Cron authentication successful')

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0]

    const wordleData = await collectWordleData(today)

    return NextResponse.json({
      success: true,
      message: 'Wordle data collected successfully',
      data: {
        id: wordleData.id,
        date: wordleData.date,
        word: wordleData.word,
        definition: wordleData.definition.substring(0, 50) + '...',
        interesting_fact: wordleData.interesting_fact.substring(0, 50) + '...'
      }
    })

  } catch (error) {
    console.error('❌ Wordle collection cron job failed:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET handler for Vercel cron (newer pattern) and manual testing
export async function GET(request: NextRequest) {
  console.log('🧩 Starting Wordle collection...')

  try {
    // Check for manual testing with secret parameter
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    // For manual testing, require secret parameter
    if (secret && secret !== process.env.CRON_SECRET) {
      console.log('❌ Invalid secret for manual testing')
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
    }

    // Allow Vercel cron (no secret) or manual testing (with correct secret)
    console.log('✅ Request authorized')

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0]

    const wordleData = await collectWordleData(today)

    return NextResponse.json({
      success: true,
      message: secret ? 'Manual Wordle collection successful' : 'Automated Wordle collection successful',
      data: {
        id: wordleData.id,
        date: wordleData.date,
        word: wordleData.word,
        definition: wordleData.definition,
        interesting_fact: wordleData.interesting_fact,
        created_at: wordleData.created_at
      }
    })

  } catch (error) {
    console.error('❌ Wordle collection failed:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}