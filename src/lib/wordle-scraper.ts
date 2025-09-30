// Wordle web scraping utility for Tom's Guide archive
import * as cheerio from 'cheerio'

// Map calendar date to Wordle puzzle number
function getPuzzleNumber(targetDate: string): number {
  const start = new Date("2021-06-19") // NYT Wordle #1 was June 19, 2021
  const target = new Date(targetDate)
  const days = Math.floor((target.getTime() - start.getTime()) / 86_400_000)
  return 1 + days
}

// Fetch Wordle answer using Perplexity web search
async function getWordleAnswer(dateStr: string): Promise<string | null> {
  try {
    const number = getPuzzleNumber(dateStr)
    console.log(`Looking for Wordle #${number} for date ${dateStr}`)

    // Use Perplexity for web search
    const { callPerplexity } = await import('./perplexity')

    // Format date for better search
    const dateObj = new Date(dateStr)
    const monthName = dateObj.toLocaleDateString('en-US', { month: 'long' })
    const day = dateObj.getDate()
    const year = dateObj.getFullYear()

    const prompt = `Find the Wordle answer for ${monthName} ${day}, ${year} (puzzle #${number}).

Search these sources:
- Tom's Guide Wordle answers
- PC Gamer Wordle solutions
- Forbes Wordle coverage
- The Gamer Wordle answers
- Insider Gaming Wordle hints

Look for phrases like:
- "Wordle #${number} answer is [WORD]"
- "Today's Wordle answer: [WORD]"
- "The answer to Wordle ${number} is [WORD]"

Return ONLY the 5-letter answer word in UPPERCASE with no additional text, explanations, or formatting.

If you cannot find a definitive answer, leave your response blank.`

    console.log(`Using Perplexity to find Wordle #${number}`)

    const result = await callPerplexity(prompt, {
      model: 'sonar-pro',
      temperature: 0.1,
      searchContextSize: 'medium'
    })

    const cleanResult = result.trim().toUpperCase()

    // Extract just the word if there's extra text
    const wordMatch = cleanResult.match(/\b([A-Z]{5})\b/)
    if (wordMatch) {
      console.log(`Perplexity found Wordle #${number}: ${wordMatch[1]}`)
      return wordMatch[1]
    }

    console.log(`No valid Wordle answer found for #${number}`)
    return null

  } catch (error) {
    console.error('Error finding Wordle answer with Perplexity:', error)
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

  // Use Perplexity to generate accurate definition and interesting fact
  const { callPerplexity } = await import('./perplexity')

  try {
    const definitionPrompt = `Look up the word "${word}" in reliable dictionaries and provide a brief, clear definition. Keep it under 50 words and make it suitable for a general audience. Return only the definition with no extra formatting.`
    const definitionResult = await callPerplexity(definitionPrompt, {
      model: 'sonar-pro',
      temperature: 0.2,
      searchContextSize: 'low'
    })
    const definition = definitionResult.trim()

    const factPrompt = `Research the word "${word}" and share one interesting fact about its etymology, historical usage, or linguistic background. Keep it under 80 words and make it engaging. Return only the fact with no extra formatting.`
    const factResult = await callPerplexity(factPrompt, {
      model: 'sonar-pro',
      temperature: 0.3,
      searchContextSize: 'low'
    })
    const interesting_fact = factResult.trim()

    return {
      word,
      definition: definition || getBasicDefinition(word),
      interesting_fact: interesting_fact || getInterestingFact(word)
    }
  } catch (error) {
    console.error('Error generating Perplexity definition/fact:', error)
    // Fall back to basic definitions if Perplexity fails
    return {
      word,
      definition: getBasicDefinition(word),
      interesting_fact: getInterestingFact(word)
    }
  }
}

export { getPuzzleNumber, getWordleAnswer }