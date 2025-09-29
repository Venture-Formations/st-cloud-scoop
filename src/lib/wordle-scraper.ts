// Wordle web scraping utility for Tom's Guide archive
import * as cheerio from 'cheerio'

// Map calendar date to Wordle puzzle number
function getPuzzleNumber(targetDate: string): number {
  const start = new Date("2021-06-19") // NYT Wordle #1 was June 19, 2021
  const target = new Date(targetDate)
  const days = Math.floor((target.getTime() - start.getTime()) / 86_400_000)
  return 1 + days
}

// Fetch and parse Wordle answer from Tom's Guide current day page
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

    // Load HTML with cheerio for better parsing
    const $ = cheerio.load(html)

    // Look for the current Wordle answer in various possible formats
    let foundWord: string | null = null

    // Method 1: Look for text patterns that indicate the answer
    const answerPatterns = [
      /today.s\s+wordle\s+answer\s+is\s+([A-Z]{5})/i,
      /wordle\s+answer\s+today\s+is\s+([A-Z]{5})/i,
      /answer\s+is\s+([A-Z]{5})/i,
      /wordle\s+#?\d+\s+answer\s*:\s*([A-Z]{5})/i,
      /solution\s+is\s+([A-Z]{5})/i,
      /the\s+word\s+is\s+([A-Z]{5})/i
    ]

    for (const pattern of answerPatterns) {
      const match = html.match(pattern)
      if (match) {
        foundWord = match[1].toUpperCase()
        console.log(`Found answer via pattern "${pattern.source}": ${foundWord}`)
        break
      }
    }

    // Method 2: Look in specific HTML elements that commonly contain the answer
    if (!foundWord) {
      const selectors = [
        'h1, h2, h3, h4, h5, h6',
        '.article-content',
        '.entry-content',
        'p strong',
        'p b',
        '.highlight',
        '.answer'
      ]

      for (const selector of selectors) {
        $(selector).each((_, element) => {
          const text = $(element).text()
          for (const pattern of answerPatterns) {
            const match = text.match(pattern)
            if (match) {
              foundWord = match[1].toUpperCase()
              console.log(`Found answer in ${selector}: ${foundWord}`)
              return false // Break out of loops
            }
          }
        })
        if (foundWord) break
      }
    }

    // Method 3: Look for puzzle number specific to today
    if (!foundWord) {
      const puzzlePattern = new RegExp(`wordle\\s+#?${number}[^a-z]*([A-Z]{5})`, "gi")
      const match = html.match(puzzlePattern)
      if (match && match[0]) {
        const wordMatch = match[0].match(/([A-Z]{5})/)
        if (wordMatch) {
          foundWord = wordMatch[1].toUpperCase()
          console.log(`Found answer via puzzle number #${number}: ${foundWord}`)
        }
      }
    }

    if (foundWord) {
      console.log(`Successfully found Wordle #${number}: ${foundWord}`)
      return foundWord
    }

    console.log(`No Wordle answer found for #${number} (${dateStr}) on Tom's Guide current page`)
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