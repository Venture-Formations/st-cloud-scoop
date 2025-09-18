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
Write a short news article (40–75 words) based on the selected Facebook post. This should be a summary and rewrite of the original posts — NOT exact duplicate.

Original Article:
Title: ${post.title}
Description: ${post.description || 'No description available'}
Content: ${post.content ? post.content.substring(0, 1500) + '...' : 'No additional content'}

WRITING GUIDELINES:
- Length: ≥40 and ≤75 words per article
- Structure: Write only one concise paragraph
- Style: Informative, engaging, locally relevant

STRICT CONTENT RULES:
- Articles must be rewritten and summarized — no copying original text
- Use ONLY information contained in the source Facebook post
- Do not add numbers, dates, quotes, or details not in the original
- Avoid 'today,' 'tomorrow,' 'yesterday' — use actual day of week based on published date
- No emojis in headlines or article content
- Stick to facts, avoid editorial commentary

HEADLINE CREATION RULES:
- Do NOT reuse or slightly reword the original title
- Make emotionally engaging, curiosity-driven, or locally relevant
- Use powerful verbs, emotional adjectives, or unexpected twists
- Do NOT use colons (:) in headlines
- No emojis in headlines or content

Respond with valid JSON in this exact format:
{
  "compelling_headline": "<engaging headline for newsletter>",
  "article_text_paragraph_1": "<40-75 word newsletter content>",
  "word_count": <exact word count>,
  "source_url": "${post.source_url || ''}",
  "author": "<author from original post>"
}`,

  factChecker: (newsletterContent: string, originalContent: string) => `
Rate article accuracy, timeliness, and intent alignment against the paired source post; preserve article text for HTML conversion.

Newsletter Article:
${newsletterContent}

Original Source Material:
${originalContent.substring(0, 2000)}

VERIFICATION PROCESS - Check each article for:
- Added facts not in source
- Changed numbers, dates, or specifics
- Invented quotes or statements
- Misinterpreted or overstated source content
- Added context or speculation not present in original
- Timeliness: Article is current relative to the source post date
- Intent alignment: Article preserves the source's purpose and emphasis

RULES:
- Use only the provided article and source content; do not browse or assume external facts
- If a claim cannot be verified from the source, mark it as "unverifiable" in notes
- Do not modify any article text fields; preserve punctuation and spacing
- Quote exact phrases from the source in "reasoning" when explaining mismatches
- When uncertain, choose conservative section ratings

SCORING (1–10 for each section, 10 = excellent, 1 = poor):

ACCURACY RATING:
- Start at 10
- Subtract 3–5 for any incorrect/contradictory fact, quote, number, date, place
- Subtract 1–2 for unverifiable or ambiguous claims
- Subtract 1 for overstated certainty without support
- Minimum 1

TIMELINESS RATING:
- Start at 10
- Subtract 3–5 if article presents outdated info as current or misstates timing
- Subtract 1–3 if time-bound phrasing lacks a clear date (e.g., "today" without date)
- Subtract 1 if it fails to note ongoing/uncertain status when relevant
- Minimum 1

INTENT ALIGNMENT RATING:
- Start at 10
- Subtract 2–4 for drift from the source's purpose/emphasis
- Subtract 1–2 for added spin/speculation not in source
- Subtract 1–2 for scope creep (new claims beyond source)
- Minimum 1

TOTAL RATING: accuracy_rating + timeliness_rating + intent_alignment_rating (range 3–30)

Respond with valid JSON in this exact format:
{
  "accuracy_rating": <number 1-10>,
  "timeliness_rating": <number 1-10>,
  "intent_alignment_rating": <number 1-10>,
  "total_rating": <number 3-30>,
  "specific_issues_found": "<list of issues or 'none'>",
  "reasoning": "<detailed explanation with exact quotes from source when explaining mismatches>"
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