// Wordle web scraping utility for Tom's Guide archive
import * as cheerio from 'cheerio'

// Map calendar date to Wordle puzzle number
function getPuzzleNumber(targetDate: string): number {
  const start = new Date("2021-06-19") // NYT Wordle #1 was June 19, 2021
  const target = new Date(targetDate)
  const days = Math.floor((target.getTime() - start.getTime()) / 86_400_000)
  return 1 + days
}

// Fetch Wordle answer using web search instead of manual scraping
async function getWordleAnswer(dateStr: string): Promise<string | null> {
  try {
    const number = getPuzzleNumber(dateStr)
    console.log(`Looking for Wordle #${number} for date ${dateStr}`)

    // Use web search to find Wordle answer directly
    const { callOpenAIWithWebSearch } = await import('./openai')

    const systemPrompt = `You are a puzzle researcher with web access. Find today's Wordle answer from Tom's Guide or other reliable Wordle spoiler sources.`

    const userPrompt = `Search for the Wordle answer for ${dateStr}, based on trusted spoiler sources and high-confidence solver reports.

TRUSTED SOURCES TO CHECK:
- Tom's Guide "Today's Wordle Answer" section
- Forbes Wordle coverage
- Rock Paper Shotgun Wordle guides
- Wordle Bot reports
- IGN Wordle solutions
- PC Gamer Wordle answers
- Other reliable gaming/puzzle spoiler sites

Look specifically for:
- "Today's Wordle answer is [WORD]"
- "The answer is [WORD]"
- "Wordle #${number} answer: [WORD]"
- The explicit 5-letter solution word for puzzle #${number}

Return ONLY the 5-letter answer word in UPPERCASE. No explanations, no hints, just the word.

If you cannot find the exact answer, return "UNKNOWN".`

    console.log(`Using web search to find Wordle #${number}`)

    const result = await callOpenAIWithWebSearch(systemPrompt, userPrompt)

    if (result && typeof result === 'string') {
      const cleanResult = result.trim().toUpperCase()
      if (/^[A-Z]{5}$/.test(cleanResult)) {
        console.log(`Web search found Wordle #${number}: ${cleanResult}`)
        return cleanResult
      }
    } else if (result && typeof result === 'object' && result.raw) {
      const cleanResult = result.raw.trim().toUpperCase()
      if (/^[A-Z]{5}$/.test(cleanResult)) {
        console.log(`Web search found Wordle #${number}: ${cleanResult}`)
        return cleanResult
      }
    }

    console.log(`No valid Wordle answer found for #${number}`)
    return null

  } catch (error) {
    console.error('Error finding Wordle answer with web search:', error)
    return null
  }
}

// Get basic definition from a word (fallback dictionary lookup)
function getBasicDefinition(word: string): string {
  // Simple fallback definitions for common Wordle words
  const definitions: { [key: string]: string } = {
    'GOOEY': 'Soft and sticky',
    'BEACH': 'Sandy shore by the ocean',
    'STORM': 'Violent weather with strong winds and rain',
    'CLOUD': 'Visible mass of water vapor in the sky',
    'SPARK': 'Small fiery particle or bright flash',
    'GLINT': 'Brief flash or gleam of light'
  }

  return definitions[word] || `A five-letter word: ${word}`
}

// Get interesting fact about a word (simple fallback)
function getInterestingFact(word: string): string {
  const facts: { [key: string]: string } = {
    'GOOEY': 'The word gooey comes from the informal word goo, first recorded in the early 1900s',
    'BEACH': 'Beach comes from Old English bæce meaning stream or valley',
    'STORM': 'Storm derives from Old English meaning to rage or be in violent motion',
    'CLOUD': 'Cloud originally meant rock or hill in Old English before meaning sky formation',
    'SPARK': 'Spark dates back to Old English spearca meaning glowing particle',
    'GLINT': 'Glint originated in early 19th century from Scandinavian glinta meaning to shine'
  }

  return facts[word] || `The word ${word} has appeared in the New York Times Wordle puzzle`
}

// Main function to get complete Wordle data for a date
export async function getWordleDataForDate(dateStr: string): Promise<{
  word: string
  definition: string
  interesting_fact: string
} | null> {
  const word = await getWordleAnswer(dateStr)

  if (!word) {
    return null
  }

  // Use web search to generate accurate definition and interesting fact
  const { callOpenAIWithWebSearch } = await import('./openai')

  try {
    const systemPrompt = `You are a dictionary researcher with web access. Provide accurate definitions and etymology information.`

    const definitionPrompt = `Look up the word "${word}" in reliable dictionaries and provide a brief, clear definition. Keep it under 50 words and make it suitable for a general audience.`
    const definitionResult = await callOpenAIWithWebSearch(systemPrompt, definitionPrompt)
    const definition = (typeof definitionResult === 'string' ? definitionResult : definitionResult?.raw || '').trim()

    const factPrompt = `Research the word "${word}" and share one interesting fact about its etymology, historical usage, or linguistic background. Keep it under 80 words and make it engaging.`
    const factResult = await callOpenAIWithWebSearch(systemPrompt, factPrompt)
    const interesting_fact = (typeof factResult === 'string' ? factResult : factResult?.raw || '').trim()

    return {
      word,
      definition: definition || getBasicDefinition(word),
      interesting_fact: interesting_fact || getInterestingFact(word)
    }
  } catch (error) {
    console.error('Error generating web-searched definition/fact:', error)
    // Fall back to basic definitions if web search fails
    return {
      word,
      definition: getBasicDefinition(word),
      interesting_fact: getInterestingFact(word)
    }
  }
}

export { getPuzzleNumber, getWordleAnswer }