import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// AI Prompts as specified in PRD
export const AI_PROMPTS = {
  contentEvaluator: (post: { title: string; description: string; content?: string }) => `
You are evaluating a news article for inclusion in a local St. Cloud, Minnesota newsletter. Rate on three dimensions using a 1-10 scale:

INTEREST LEVEL (1-10): How intriguing, surprising, or engaging is this story?
HIGH SCORING: Unexpected developments, human interest stories, breaking news, unique events, broad appeal, fun/entertaining
LOW SCORING: Routine announcements, technical/administrative content, repetitive topics, purely promotional, very short content (subtract points for lack of substance)

LOCAL RELEVANCE (1-10): How directly relevant is this to St. Cloud area residents?
HIGH SCORING: Events/news in St. Cloud and surrounding areas (Waite Park, Sartell, Sauk Rapids, Cold Spring), Stearns County government decisions, local business changes, school district news, local infrastructure/development, community events
LOW SCORING: State/national news without local angle, events far from St. Cloud area, generic content not location-specific

COMMUNITY IMPACT (1-10): How much does this affect local residents' daily lives or community?
HIGH SCORING: New services or amenities, policy changes affecting residents, public safety information, economic development/job creation, community services and resources
LOW SCORING: Individual achievements with limited community effect, internal organizational matters, entertainment without broader impact

BONUS: Add 2 extra points to total_score for stories mentioning multiple local communities or regional impact.

BLANK RATING CONDITIONS: Leave all fields blank if:
- Description contains ≤10 words
- Post is about weather happening today/tomorrow
- Post is written before an event happening "today"/"tonight"/"this evening"

Article Title: ${post.title}
Article Description: ${post.description || 'No description available'}
Article Content: ${post.content ? post.content.substring(0, 1000) + '...' : 'No content available'}

IMPORTANT: You must respond with ONLY valid JSON. Do not include any text before or after the JSON.

{
  "interest_level": <number 1-10>,
  "local_relevance": <number 1-10>,
  "community_impact": <number 1-10>,
  "reasoning": "<detailed explanation of your scoring>"
}`,

  topicDeduper: (posts: Array<{ title: string; description: string }>) => `
You are identifying duplicate stories from multiple news sources. Review these articles and group them by topic if they cover the same story. For each group, select the article with the most comprehensive content.

Articles to analyze:
${posts.map((post, i) => `${i + 1}. ${post.title}\n   ${post.description || 'No description'}`).join('\n\n')}

Respond with valid JSON in this exact format:
{
  "groups": [
    {
      "topic_signature": "<brief topic description>",
      "primary_article_index": <number>,
      "duplicate_indices": [<array of numbers>],
      "similarity_explanation": "<why these are duplicates>"
    }
  ],
  "unique_articles": [<array of article indices that are unique>]
}`,

  newsletterWriter: (post: { title: string; description: string; content?: string; source_url?: string }) => `
CRITICAL: You are writing a news article that MUST follow strict content rules. Violations will result in rejection.

Original Source Post:
Title: ${post.title}
Description: ${post.description || 'No description available'}
Content: ${post.content ? post.content.substring(0, 1500) + '...' : 'No additional content'}

MANDATORY STRICT CONTENT RULES - FOLLOW EXACTLY:
1. Articles must be COMPLETELY REWRITTEN and summarized — NEVER copy or slightly modify original text
2. Use ONLY information contained in the source post above — DO NOT add any external information
3. DO NOT add numbers, dates, quotes, or details not explicitly stated in the original
4. NEVER use 'today,' 'tomorrow,' 'yesterday' — use actual day of week if date reference needed
5. NO emojis anywhere in headlines or article content
6. Stick to facts only — NO editorial commentary, opinions, or speculation

HEADLINE REQUIREMENTS - MUST FOLLOW:
- NEVER reuse or slightly reword the original title
- Create completely new, engaging headline
- Use powerful verbs and emotional adjectives
- NO colons (:) in headlines
- NO emojis

ARTICLE REQUIREMENTS:
- Length: EXACTLY 40-75 words
- Structure: One concise paragraph only
- Style: Informative, engaging, locally relevant
- REWRITE completely — do not copy phrases from original

BEFORE RESPONDING: Double-check that you have:
✓ Completely rewritten the content (no copied phrases)
✓ Used only information from the source post
✓ Created a new headline (not modified original)
✓ Stayed between 40-75 words
✓ Avoided all prohibited words and phrases
✓ Included no editorial commentary

Respond with valid JSON in this exact format:
{
  "headline": "<completely new engaging headline>",
  "content": "<40-75 word completely rewritten article>",
  "word_count": <exact word count>
}`,

  factChecker: (newsletterContent: string, originalContent: string) => `
CRITICAL FACT-CHECK: Verify this newsletter article follows strict content rules and contains no violations.

Newsletter Article:
${newsletterContent}

Original Source Material:
${originalContent.substring(0, 2000)}

STRICT CONTENT VIOLATIONS TO CHECK FOR:
1. COPIED TEXT: Any phrases, sentences, or words directly copied from source
2. ADDED INFORMATION: Any facts, numbers, dates, quotes not in original source
3. PROHIBITED WORDS: Use of 'today,' 'tomorrow,' 'yesterday' instead of specific days
4. EMOJIS: Any emojis in headline or content
5. EDITORIAL CONTENT: Opinions, speculation, or commentary not in source
6. MODIFIED ORIGINAL TITLE: Headlines that are just slightly reworded versions of original

ACCURACY SCORING (1-10, where 10 = perfect compliance):
- Start at 10
- Subtract 5 points for ANY copied text or phrases from original
- Subtract 4 points for ANY added information not in source
- Subtract 3 points for prohibited time words (today/tomorrow/yesterday)
- Subtract 2 points for ANY emojis found
- Subtract 3 points for editorial commentary or speculation
- Subtract 4 points if headline is just modified version of original title
- Minimum score: 1

TIMELINESS SCORING (1-10):
- Start at 10
- Subtract 5 points for outdated information presented as current
- Subtract 3 points for vague time references without context
- Subtract 2 points for missing temporal context when needed
- Minimum score: 1

INTENT ALIGNMENT SCORING (1-10):
- Start at 10
- Subtract 4 points for changing the source's main message
- Subtract 3 points for adding interpretation not in source
- Subtract 2 points for emphasis shifts from original
- Minimum score: 1

TOTAL SCORE = accuracy + timeliness + intent (3-30 range)
PASSING THRESHOLD: 20/30 minimum

Respond with valid JSON in this exact format:
{
  "score": <number 3-30>,
  "details": "<detailed list of all violations found or 'none'>",
  "passed": <boolean true if score >= 20, false otherwise>
}`,

  subjectLineGenerator: (articles: Array<{ headline: string; content: string }>) => `
Craft a front-page newspaper headline for the next-day edition based on the most interesting article.

Articles in this newsletter:
${articles.map((article, i) => `${i + 1}. ${article.headline}\n   ${article.content.substring(0, 100)}...`).join('\n\n')}

HARD RULES:
- ≤ 39 characters (count every space and punctuation)
- Title Case; avoid ALL-CAPS words
- Omit the year
- No em dashes (—)
- No colons (:) or other punctuation that splits the headline into two parts
- Return only the headline text—nothing else

IMPACT CHECKLIST:
- Lead with a power verb
- Local pride—include place name if it adds punch
- Trim fluff—every word earns its spot
- Character audit—recount after final trim

STYLE GUIDANCE: Write the headline as if the event just happened, not as a historical reflection or anniversary. Avoid words like 'Legacy,' 'Honors,' 'Remembers,' or 'Celebrates History.' Use an urgent, active voice suitable for a breaking news front page.

Respond with valid JSON in this exact format:
{
  "subject_line": "<subject line>",
  "character_count": <exact character count>
}`
}

export async function callOpenAI(prompt: string, maxTokens = 1000) {
  try {
    console.log('Calling OpenAI API...')

    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // Use higher quality model
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3,
      }, {
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response from OpenAI')
      }

      console.log('OpenAI response received')

      // Try to parse as JSON, fallback to raw content
      try {
        // Clean the content - remove any text before/after JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0])
        } else {
          return JSON.parse(content)
        }
      } catch (parseError) {
        console.warn('Failed to parse OpenAI response as JSON:', content)
        console.warn('Parse error:', parseError)
        return { raw: content }
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message)
    }
    throw error
  }
}