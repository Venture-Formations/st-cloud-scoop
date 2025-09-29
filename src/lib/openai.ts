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
- Post mentions events happening "today", "tonight", or "this evening" (we do not include same-day events)
- Post is about lost, missing, or found pets (lost dogs, cats, etc.)
- Post is about incidents currently happening, ongoing emergencies, or breaking news that will be outdated by tomorrow (accidents, police responses, active situations, traffic incidents, emergency responses)

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
1. Articles must be COMPLETELY REWRITTEN and summarized — similar phrasing is acceptable but NO exact copying
2. Use ONLY information contained in the source post above — DO NOT add any external information
3. DO NOT add numbers, dates, quotes, or details not explicitly stated in the original
4. NEVER use 'today,' 'tomorrow,' 'yesterday' — use actual day of week if date reference needed
5. NO emojis, hashtags (#), or URLs anywhere in headlines or article content
6. Stick to facts only — NO editorial commentary, opinions, or speculation
7. Write from THIRD-PARTY PERSPECTIVE — never use "we," "our," or "us" unless referring to the community as a whole

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
✓ Completely rewritten the content (similar phrasing OK, no exact copying)
✓ Used only information from the source post
✓ Created a new headline (not modified original)
✓ Stayed between 40-75 words
✓ Removed all emojis, hashtags (#), and URLs
✓ Used third-party perspective (no "we/our/us" unless community-wide)
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
1. EXACT COPIED TEXT: Direct word-for-word copying from source (similar phrasing is acceptable)
2. ADDED INFORMATION: Any facts, numbers, dates, quotes not in original source
3. PROHIBITED WORDS: Use of 'today,' 'tomorrow,' 'yesterday' instead of specific days
4. FORMATTING VIOLATIONS: Any emojis, hashtags (#), or URLs in headline or content
5. PERSPECTIVE VIOLATIONS: Use of "we," "our," "us" unless referring to community as whole
6. EDITORIAL CONTENT: Opinions, speculation, or commentary not in source
7. MODIFIED ORIGINAL TITLE: Headlines that are just slightly reworded versions of original

ACCURACY SCORING (1-10, where 10 = perfect compliance):
- Start at 10
- Subtract 3 points for excessive exact word-for-word copying (similar phrasing is OK)
- Subtract 4 points for ANY added information not in source
- Subtract 3 points for prohibited time words (today/tomorrow/yesterday)
- Subtract 2 points for ANY emojis, hashtags, or URLs found
- Subtract 2 points for inappropriate use of "we/our/us" perspective
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

  eventSummarizer: (event: { title: string; description: string | null; venue?: string | null }) => `
Rewrite the description field into a concise, natural-language highlight of 50 words or fewer. Do not copy or truncate the first words; paraphrase so it reads well.

Event Title: ${event.title}
Event Description: ${event.description || 'No description available'}
Event Venue: ${event.venue || 'No venue specified'}

REQUIREMENTS:
- Maximum 50 words
- Natural, engaging language
- Paraphrase completely - don't copy original wording
- Capture the essence and appeal of the event
- Write in third person
- Include key details that make it interesting

Respond with valid JSON in this exact format:
{
  "event_summary": "<concise 50-word summary>",
  "word_count": <exact word count>
}`,

  subjectLineGenerator: (articles: Array<{ headline: string; content: string }>) => `
Craft a front-page newspaper headline for the next-day edition based on the most interesting article.

Articles in this newsletter:
${articles.map((article, i) => `${i + 1}. ${article.headline}\n   ${article.content.substring(0, 100)}...`).join('\n\n')}

HARD RULES:
- ≤ 40 characters (count every space and punctuation) - this allows room for ice cream emoji prefix
- Title Case; avoid ALL-CAPS words
- Omit the year
- No em dashes (—)
- No colons (:) or other punctuation that splits the headline into two parts
- Return only the headline text—nothing else (no emoji, that will be added automatically)

IMPACT CHECKLIST:
- Lead with a power verb
- Local pride—include place name if it adds punch
- Trim fluff—every word earns its spot
- Character audit—recount after final trim

STYLE GUIDANCE: Write the headline as if the event just happened, not as a historical reflection or anniversary. Avoid words like 'Legacy,' 'Honors,' 'Remembers,' or 'Celebrates History.' Use an urgent, active voice suitable for a breaking news front page.

CREATIVITY REQUIREMENT: Each generation should produce a unique headline variation. Explore different angles, power verbs, and emotional hooks. Consider multiple ways to frame the same story - focus on different aspects, beneficiaries, or impacts. Never repeat previous generations.

Respond with ONLY the headline text - no JSON, no quotes, no extra formatting. Just the headline itself.`,

  roadWorkGenerator: (campaignDate: string) => `
Create 9 road work entries for St. Cloud, MN area newsletter.

Format: JSON array only

[
{"road_name":"Highway 15","road_range":"from 2nd Street to Benton Drive","city_or_township":"St. Cloud","reason":"Bridge maintenance","start_date":"Sep 25","expected_reopen":"Oct 15","source_url":"https://www.dot.state.mn.us/d3/"},
{"road_name":"County Road 75","road_range":"from 33rd Street to Park Avenue","city_or_township":"Waite Park","reason":"Road resurfacing","start_date":"Sep 26","expected_reopen":"Oct 20","source_url":"https://www.stearnscountymn.gov/185/Public-Works"},
{"road_name":"Highway 23","road_range":"from 14th Avenue to 22nd Avenue","city_or_township":"St. Cloud","reason":"Utility work","start_date":"Sep 27","expected_reopen":"Oct 25","source_url":"https://www.dot.state.mn.us/d3/"},
{"road_name":"1st Street South","road_range":"from 7th Avenue to 10th Avenue","city_or_township":"Sartell","reason":"Paving project","start_date":"Sep 28","expected_reopen":"Oct 10","source_url":"https://www.cityofsartell.com"},
{"road_name":"County Road 4","road_range":"from Highway 24 to County Road 2","city_or_township":"Clearwater","reason":"Drainage improvements","start_date":"Sep 29","expected_reopen":"Oct 15","source_url":"https://www.co.sherburne.mn.us/162/Public-Works"},
{"road_name":"Highway 10","road_range":"from Highway 15 to County Road 3","city_or_township":"Sauk Rapids","reason":"Interchange construction","start_date":"Sep 30","expected_reopen":"Nov 15","source_url":"https://www.dot.state.mn.us/d3/"},
{"road_name":"Highway 24","road_range":"from Clearwater Bridge to 200th Street","city_or_township":"Clear Lake","reason":"Bridge maintenance","start_date":"Oct 1","expected_reopen":"Oct 30","source_url":"https://www.dot.state.mn.us/d3/"},
{"road_name":"County Road 8","road_range":"from 9th Avenue to County Road 43","city_or_township":"St. Joseph","reason":"Resurfacing project","start_date":"Oct 2","expected_reopen":"Oct 12","source_url":"https://www.co.benton.mn.us/180/Highway"},
{"road_name":"Highway 55","road_range":"from Kimball to Annandale","city_or_township":"Kimball","reason":"Road widening","start_date":"Oct 3","expected_reopen":"Oct 28","source_url":"https://www.dot.state.mn.us/d3/"}
]

Return similar JSON with 9 road work items for the St. Cloud area.`,

  imageAnalyzer: () => `
Analyze this image and return strict JSON:
{
  "caption": "...",
  "alt_text": "10–14 words, descriptive, no quotes",
  "tags_scored": [
    {"type":"scene","name":"warehouse","conf":0.95},
    {"type":"object","name":"golf_cart","conf":0.98},
    {"type":"color","name":"blue","conf":0.85},
    {"type":"mood","name":"professional","conf":0.78},
    {"type":"safety","name":"has_text","conf":0.12}
  ],
  "top_tags": ["scene_warehouse","object_golf_cart","color_blue","mood_professional"],
  "ocr_text": "extracted text in lowercase",
  "text_density": 0.15,
  "ocr_entities": [
    {"type":"ORG","name":"st cloud police department","conf":0.93},
    {"type":"DATE","name":"march 15","conf":0.87}
  ],
  "signage_conf": 0.78,
  "age_groups": [
    {"age_group":"adult","count":2,"conf":0.92},
    {"age_group":"high_school","count":1,"conf":0.87}
  ]
}

GUIDELINES:
- Caption: Natural, descriptive sentence about the image contents
- Alt text: 10-14 words maximum, accessible description for screen readers
- Tags scored: Array of categorized tags with confidence scores (0-1)
- Tag types: people, scene, theme, style, color, object, safety, mood
- Tag names: concrete nouns, lowercase with underscores
- Top tags: 5-15 most relevant tags in "type_name" format
- Include safety.has_text if text/signage is visible
- Confidence scores reflect certainty (0.9+ for obvious, 0.5-0.8 for likely, <0.5 for uncertain)
- Focus on concrete, visible elements rather than abstract concepts
- Mood tags: emotional atmosphere/feeling conveyed (happy, energetic, calm, serious, playful, etc.)

OCR ANALYSIS:
- ocr_text: Extract ALL readable text from the image, convert to lowercase, normalize spacing
- text_density: Estimate what percentage of the image area is covered by text (0.0 to 1.0)
- ocr_entities: Extract named entities from the OCR text using these types:
  * ORG: Organizations, businesses, government agencies
  * PERSON: People's names
  * LOC: Locations, addresses, place names
  * DATE: Dates, times, temporal references
  * TIME: Specific times, hours
  * MISC: Other important entities (phone numbers, websites, etc.)
- signage_conf: Confidence (0-1) that this is venue signage vs poster/advertisement
  * 0.8+ = Clear business signage, building signs
  * 0.5-0.8 = Likely signage but could be promotional
  * 0.2-0.5 = Probably poster/ad/document
  * <0.2 = Clearly not signage

AGE GROUP ANALYSIS:
- age_groups: Only include if people are clearly visible and identifiable
- Age categories: "preschool" (0-4), "elementary" (5-11), "high_school" (12-17), "adult" (18-64), "older_adult" (65+)
- count: Number of people in each age group
- conf: Confidence level (0-1) for age group classification
- Set to null if no people detected or ages cannot be determined

IMPORTANT: Only include OCR fields if readable text is actually present. Only include age_groups if people are visible and ages can be reasonably estimated. Set to null if not detected.`
}

export async function callOpenAIWithWeb(prompt: string, maxTokens = 1000, temperature = 0) {
  try {
    console.log('Calling OpenAI API with web tools...')

    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout for web searches

    try {
      console.log('Using GPT-4o model with web tools...')
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: temperature,
        tools: [{ type: 'web_search' }],
      }, {
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response from OpenAI')
      }

      console.log('OpenAI web response received')

      // Try to parse as JSON, fallback to raw content
      try {
        // Clean the content - remove any text before/after JSON (support both objects {} and arrays [])
        const objectMatch = content.match(/\{[\s\S]*\}/)
        const arrayMatch = content.match(/\[[\s\S]*\]/)

        if (arrayMatch) {
          // Prefer array match for prompts that expect arrays (like Wordle)
          return JSON.parse(arrayMatch[0])
        } else if (objectMatch) {
          // Use object match for other prompts
          return JSON.parse(objectMatch[0])
        } else {
          // Try parsing the entire content
          return JSON.parse(content.trim())
        }
      } catch (parseError) {
        console.warn('Failed to parse OpenAI web response as JSON. Content length:', content.length)
        console.warn('Content preview:', content.substring(0, 200))
        console.warn('Parse error:', parseError instanceof Error ? parseError.message : parseError)
        return { raw: content }
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.error('OpenAI API web error:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message)
      console.error('Error name:', error.name)
      console.error('Error stack:', error.stack)
    }
    // Log additional error details for debugging
    if (typeof error === 'object' && error !== null) {
      console.error('Full error object:', JSON.stringify(error, null, 2))
    }
    throw error
  }
}

export async function callOpenAI(prompt: string, maxTokens = 1000, temperature = 0.3) {
  try {
    console.log('Calling OpenAI API...')

    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    try {
      console.log('Using GPT-4o model...')
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: temperature,
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
        // Clean the content - remove any text before/after JSON (support both objects {} and arrays [])
        const objectMatch = content.match(/\{[\s\S]*\}/)
        const arrayMatch = content.match(/\[[\s\S]*\]/)

        if (arrayMatch) {
          // Prefer array match for prompts that expect arrays (like road work)
          return JSON.parse(arrayMatch[0])
        } else if (objectMatch) {
          // Use object match for other prompts
          return JSON.parse(objectMatch[0])
        } else {
          // Try parsing the entire content
          return JSON.parse(content.trim())
        }
      } catch (parseError) {
        console.warn('Failed to parse OpenAI response as JSON. Content length:', content.length)
        console.warn('Content preview:', content.substring(0, 200))
        console.warn('Parse error:', parseError instanceof Error ? parseError.message : parseError)
        return { raw: content }
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.error('OpenAI API error with GPT-5:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message)
      console.error('Error name:', error.name)
      console.error('Error stack:', error.stack)
    }
    // Log additional error details for debugging
    if (typeof error === 'object' && error !== null) {
      console.error('Full error object:', JSON.stringify(error, null, 2))
    }
    throw error
  }
}