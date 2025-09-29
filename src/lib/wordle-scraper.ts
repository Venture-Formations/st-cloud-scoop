// Wordle web scraping utility for Tom's Guide archive
import * as cheerio from 'cheerio'

// Map calendar date to Wordle puzzle number
function getPuzzleNumber(targetDate: string): number {
  const start = new Date("2021-06-19") // NYT Wordle #1 was June 19, 2021
  const target = new Date(targetDate)
  const days = Math.floor((target.getTime() - start.getTime()) / 86_400_000)
  return 1 + days
}

// Fetch and parse Wordle answer from Tom's Guide archive
async function getWordleAnswer(dateStr: string): Promise<string | null> {
  try {
    const number = getPuzzleNumber(dateStr)
    console.log(`Looking for Wordle #${number} for date ${dateStr}`)

    const response = await fetch("https://www.tomsguide.com/news/wordle-answers-all-past")

    if (!response.ok) {
      console.error(`Failed to fetch Tom's Guide archive: ${response.status} ${response.statusText}`)
      return null
    }

    const html = await response.text()

    // Look for the puzzle number in the text using regex
    const regex = new RegExp(`Wordle\\s+#${number}\\D+([A-Z]{5})`, "i")
    const match = html.match(regex)

    if (match) {
      const word = match[1].toUpperCase()
      console.log(`Found Wordle #${number}: ${word}`)
      return word
    }

    // Alternative parsing using cheerio if regex fails
    const $ = cheerio.load(html)

    // Look through all text content for the puzzle number
    let foundWord: string | null = null
    $('*').each((_, element) => {
      const text = $(element).text()
      const match = text.match(new RegExp(`Wordle\\s+#${number}[^A-Z]*([A-Z]{5})`, "i"))
      if (match) {
        foundWord = match[1].toUpperCase()
        return false // Break out of loop
      }
    })

    if (foundWord) {
      console.log(`Found Wordle #${number} via cheerio: ${foundWord}`)
      return foundWord
    }

    console.log(`No Wordle answer found for #${number} (${dateStr})`)
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