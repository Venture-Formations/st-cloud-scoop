// Wordle web scraping utility for Tom's Guide archive
import * as cheerio from 'cheerio'

// Map calendar date to Wordle puzzle number
function getPuzzleNumber(targetDate: string): number {
  const start = new Date("2021-06-19") // NYT Wordle #1 was June 19, 2021
  const target = new Date(targetDate)
  const days = Math.floor((target.getTime() - start.getTime()) / 86_400_000)
  return 1 + days
}

// Fetch and parse Wordle answer from Tom's Guide current day page using AI analysis
async function getWordleAnswer(dateStr: string): Promise<string | null> {
  try {
    const number = getPuzzleNumber(dateStr)
    console.log(`Looking for Wordle #${number} for date ${dateStr}`)

    const response = await fetch("https://www.tomsguide.com/news/what-is-todays-wordle-answer", {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    })

    if (!response.ok) {
      console.error(`Failed to fetch Tom's Guide Wordle page: ${response.status} ${response.statusText}`)
      return null
    }

    const html = await response.text()
    console.log(`Fetched Tom's Guide page, content length: ${html.length}`)

    // Load HTML with cheerio to extract clean text content
    const $ = cheerio.load(html)

    // Extract the main article content and remove scripts/styles
    $('script, style, nav, header, footer, .advertisement, .ad').remove()
    const articleText = $('.article-content, .entry-content, main, article').text() || $('body').text()

    // Limit content length for AI processing (keep most relevant parts)
    const contentForAI = articleText.substring(0, 4000)

    console.log(`Extracted content for AI analysis (${contentForAI.length} characters)`)

    // Use AI to analyze the content and extract the Wordle answer
    const { callOpenAI } = await import('./openai')

    const prompt = `Analyze this Tom's Guide Wordle page content and extract the current Wordle answer.

INSTRUCTIONS:
- Look for today's Wordle answer (puzzle #${number})
- The answer is always exactly 5 letters
- Return ONLY the 5-letter word in uppercase, nothing else
- If you find a list of recent answers, use the one for puzzle #${number}
- Ignore partial words like "REMAI" from "remains" - only find complete standalone words
- Do not return any explanations, just the word

CONTENT:
${contentForAI}`

    const result = await callOpenAI(prompt, 'gpt-4', { max_tokens: 10, temperature: 0 })

    if (result && typeof result === 'string') {
      const cleanResult = result.trim().toUpperCase()

      // Validate it's exactly 5 letters
      if (/^[A-Z]{5}$/.test(cleanResult)) {
        console.log(`AI extracted Wordle #${number}: ${cleanResult}`)
        return cleanResult
      } else {
        console.log(`AI returned invalid format: "${cleanResult}"`)
      }
    } else if (result && typeof result === 'object' && result.raw) {
      const cleanResult = result.raw.trim().toUpperCase()

      // Validate it's exactly 5 letters
      if (/^[A-Z]{5}$/.test(cleanResult)) {
        console.log(`AI extracted Wordle #${number}: ${cleanResult}`)
        return cleanResult
      } else {
        console.log(`AI returned invalid format: "${cleanResult}"`)
      }
    }

    console.log(`No valid Wordle answer found for #${number} (${dateStr})`)
    return null

  } catch (error) {
    console.error('Error scraping Wordle answer:', error)
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

  return {
    word,
    definition: getBasicDefinition(word),
    interesting_fact: getInterestingFact(word)
  }
}

export { getPuzzleNumber, getWordleAnswer }