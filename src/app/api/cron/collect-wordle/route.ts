import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { callOpenAI } from '@/lib/openai'

// Create Wordle prompt function
function createWordlePrompt(date: string) {
  // Format date for the prompt
  const dateObj = new Date(date + 'T00:00:00')
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return `Find the Wordle answer for ${formattedDate}. This information is publicly available on sites like Tom's Guide (https://www.tomsguide.com/news/what-is-todays-wordle-answer) and other Wordle spoiler sites.

Required fields: word, definition, interesting_fact

Field constraints:
- definition: string, max 30 words, from Merriam-Webster/Oxford/Collins
- interesting_fact: string, max 50 words, game show-worthy trivia about etymology, pop culture use, or historical notes

Trusted sources: Tom's Guide Wordle answers, Reddit r/wordle daily thread, wordlesolver.net, NYT WordleBot

Output format: JSON array only, starts with [

Output structure:
[{
  "word": "string",
  "definition": "string (≤ 30 words)",
  "interesting_fact": "string (≤ 50 words, game show-worthy, do not show source)"
}]

If unconfirmed, return: [{"word": "Unknown", "definition": "Unknown", "interesting_fact": "Unknown"}]

Do not wrap the output in triple backticks or markdown. Return only JSON. No comments or explanations.`
}

async function collectWordleData(date: string, forceRefresh = false) {
  console.log(`🧩 Collecting Wordle data for ${date}...`)

  // Check if we already have data for this date
  const { data: existing } = await supabaseAdmin
    .from('wordle')
    .select('*')
    .eq('date', date)
    .single()

  if (existing && !forceRefresh) {
    console.log(`✅ Wordle data already exists for ${date}`)
    return existing
  }

  if (forceRefresh && existing) {
    console.log(`🔄 Force refresh enabled - will update existing data for ${date}`)
  }

  // Generate the prompt for today's date
  const prompt = createWordlePrompt(date)

  // Call OpenAI with the prompt
  console.log('🤖 Calling OpenAI for Wordle data...')
  const aiResponse = await callOpenAI(prompt, 1000, 0.7)

  // Parse the response
  let wordleData
  try {
    console.log('Raw AI Response:', aiResponse)
    console.log('AI Response Type:', typeof aiResponse)

    // Check if AI refused (common patterns)
    const aiText = typeof aiResponse === 'object' && aiResponse.raw ? aiResponse.raw : aiResponse
    const hasRefusal = typeof aiText === 'string' && (
      (aiText.toLowerCase().includes('sorry') && aiText.toLowerCase().includes('wordle')) ||
      aiText.toLowerCase().includes("can't provide") ||
      aiText.toLowerCase().includes("cannot provide") ||
      aiText.toLowerCase().includes("unable to provide")
    )

    if (hasRefusal) {
      console.log('AI refused to provide data, using fallback word...')
      // Generate a random word from a predefined list for fallback
      const fallbackWords = [
        { word: "BEACH", definition: "A sandy or pebbly shore by the ocean", interesting_fact: "The word beach comes from Old English 'bæce' meaning stream" },
        { word: "SPARK", definition: "A small fiery particle or bright flash", interesting_fact: "Spark dates back to Old English and originally meant a small flame" },
        { word: "COAST", definition: "The land near the shore or edge of the sea", interesting_fact: "Coast comes from the Latin word 'costa' meaning rib or side" },
        { word: "CLOUD", definition: "A visible mass of water vapor in the sky", interesting_fact: "Cloud derives from Old English 'clud' meaning rock or hill" },
        { word: "SCOOP", definition: "To lift or hollow out with a curved motion", interesting_fact: "Scoop comes from Middle Dutch 'schope' meaning ladle or shovel" }
      ]
      const randomIndex = Math.floor(Math.random() * fallbackWords.length)
      wordleData = fallbackWords[randomIndex]
      console.log('Using fallback word:', wordleData.word)
    } else {
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

      console.log('Successfully parsed AI response:', wordleData)
    }

  } catch (error) {
    console.error('Failed to parse AI response:', error)
    console.error('Raw response:', aiResponse)
    console.error('Response type:', typeof aiResponse)
    throw new Error('Failed to parse Wordle data from AI response: ' + (error instanceof Error ? error.message : 'Unknown error'))
  }

  // Insert or update database (upsert for force refresh)
  const { data: newWordle, error } = await supabaseAdmin
    .from('wordle')
    .upsert([{
      date,
      word: wordleData.word.toUpperCase(),
      definition: wordleData.definition,
      interesting_fact: wordleData.interesting_fact
    }], {
      onConflict: 'date'
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to upsert Wordle data:', error)
    throw new Error(`Database upsert failed: ${error.message}`)
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

    // Get parameters
    const dateParam = searchParams.get('date')
    const forceRefresh = searchParams.get('force') === 'true'

    // Use specified date or today's date in YYYY-MM-DD format
    const targetDate = dateParam || new Date().toISOString().split('T')[0]

    const wordleData = await collectWordleData(targetDate, forceRefresh)

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