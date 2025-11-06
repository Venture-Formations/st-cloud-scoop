# St. Cloud Scoop - Complete System Implementation Guide
## OpenAI/Perplexity AI Architecture with 7-Step Workflow

**Date:** 2025-01-22
**Implementation Approach:** Complete system upgrade (all phases at once)
**AI Providers:** OpenAI and Perplexity
**Article Structure:** Single "Local Scoop" section (10 articles total)

---

## System Overview

### What We're Building

**AI Prompt Management:**
- All 9 AI prompts stored in database as complete JSON API requests
- AI provider selection: OpenAI or Perplexity
- All prompts fully editable via Settings UI
- Testing playground for safe experimentation

**RSS Processing:**
- Hourly RSS ingestion (separate from campaign processing)
- 7-step workflow for campaign generation
- 800-second timeout per step

**Newsletter Structure:**
- **Local Scoop Articles:** 10 articles (2 batches of 5)
- **Events Section:** 8 events per day
- **Road Work Section:** 9 road work items
- **Subject Line:** AI-generated from top article

---

## Architecture Changes

### Current System → New System

| Component | Current | New |
|-----------|---------|-----|
| **AI Providers** | OpenAI only | OpenAI or Perplexity |
| **Prompt Storage** | Partial (6/9 editable) | Complete (9/9 editable) |
| **Article Sections** | Primary (3) + Secondary (3) | Local Scoop (10) |
| **RSS Ingestion** | Daily at 8:30 PM | Hourly |
| **Campaign Processing** | Single function (7 min timeout) | 7-step workflow (800s per step) |
| **Fact Checking** | Hardcoded prompt | Editable prompt |
| **Road Work** | Hardcoded prompt | Editable prompt |

---

## Phase 1: Database Schema Updates

### Add AI Provider Column

```sql
-- Add ai_provider column to app_settings
ALTER TABLE app_settings
ADD COLUMN ai_provider TEXT DEFAULT 'openai';

-- Update existing prompts to have ai_provider
UPDATE app_settings
SET ai_provider = 'openai'
WHERE key LIKE 'ai_prompt_%';
```

### Verify Schema

```sql
-- Check app_settings structure
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'app_settings';

-- Should show:
-- key (text)
-- value (jsonb)
-- description (text)
-- updated_at (timestamptz)
-- custom_default (text)
-- ai_provider (text)
```

---

## Phase 2: AI Prompt System Implementation

### File: `src/lib/openai.ts`

#### 1. Add Perplexity Client

```typescript
import OpenAI from 'openai'
import { supabaseAdmin } from './supabase'

// OpenAI client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Perplexity client (uses OpenAI SDK with custom base URL)
export const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
})
```

#### 2. Update `callWithStructuredPrompt()` to Support Perplexity

```typescript
async function callWithStructuredPrompt(
  config: {
    model?: string
    temperature?: number
    top_p?: number
    presence_penalty?: number
    frequency_penalty?: number
    messages: Array<{ role: string; content: string }>
  },
  placeholders: Record<string, string>,
  provider: 'openai' | 'perplexity' = 'openai'
): Promise<string> {
  // Replace placeholders in all messages
  const processedMessages = config.messages.map(msg => ({
    ...msg,
    content: Object.entries(placeholders).reduce(
      (content, [key, value]) => content.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        value
      ),
      msg.content
    )
  }))

  console.log(`[AI] Calling ${provider.toUpperCase()} with structured prompt:`, {
    model: config.model || (provider === 'perplexity' ? 'llama-3.1-sonar-large-128k-online' : 'gpt-4o'),
    temperature: config.temperature ?? 0.7,
    message_count: processedMessages.length
  })

  // Select client based on provider
  const client = provider === 'perplexity' ? perplexity : openai

  // Select default model based on provider
  const defaultModel = provider === 'perplexity'
    ? 'llama-3.1-sonar-large-128k-online'
    : 'gpt-4o'

  const response = await client.chat.completions.create({
    model: config.model || defaultModel,
    messages: processedMessages as any,
    temperature: config.temperature ?? 0.7,
    top_p: config.top_p,
    presence_penalty: config.presence_penalty,
    frequency_penalty: config.frequency_penalty,
  })

  const result = response.choices[0]?.message?.content || ''
  console.log(`[AI] ${provider.toUpperCase()} response received, length:`, result.length)

  return result
}
```

#### 3. Create `callAIWithPrompt()` Function

```typescript
/**
 * Universal AI prompt caller - works with OpenAI or Perplexity
 * Loads complete JSON API request from database and executes it
 *
 * @param promptKey - Database key (e.g., 'ai_prompt_content_evaluator')
 * @param placeholders - Dynamic content to replace in prompts (e.g., {{title}}, {{content}})
 * @param fallbackText - Optional fallback if database prompt not found
 * @returns AI response (parsed JSON or raw text)
 */
export async function callAIWithPrompt(
  promptKey: string,
  placeholders: Record<string, string> = {},
  fallbackText?: string
): Promise<any> {
  try {
    // Load complete JSON prompt from database
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('value, ai_provider')
      .eq('key', promptKey)
      .single()

    if (error || !data) {
      console.warn(`⚠️  [AI-PROMPT] Prompt not found in database: ${promptKey}`)

      if (!fallbackText) {
        throw new Error(`Prompt ${promptKey} not found and no fallback provided`)
      }

      // Use fallback with default settings
      return await callWithStructuredPrompt(
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: fallbackText }]
        },
        placeholders,
        'openai'
      )
    }

    console.log(`✓ [AI-PROMPT] Using database prompt: ${promptKey}`)

    // Parse prompt JSON
    const promptConfig = typeof data.value === 'string'
      ? JSON.parse(data.value)
      : data.value

    // Validate structure
    if (!promptConfig.messages || !Array.isArray(promptConfig.messages)) {
      throw new Error(`Prompt ${promptKey} is missing 'messages' array`)
    }

    // Get provider (default to 'openai')
    const provider = (data.ai_provider === 'perplexity' ? 'perplexity' : 'openai') as 'openai' | 'perplexity'

    // Call AI with structured prompt
    const response = await callWithStructuredPrompt(promptConfig, placeholders, provider)

    // Try to parse as JSON, return raw if parsing fails
    try {
      return JSON.parse(response)
    } catch {
      return response
    }

  } catch (error) {
    console.error(`❌ [AI-PROMPT] ERROR calling ${promptKey}:`, error)
    throw error
  }
}
```

#### 4. Update All AI_PROMPTS to Use `callAIWithPrompt()`

Replace existing `AI_PROMPTS` implementations:

```typescript
export const AI_PROMPTS = {
  contentEvaluator: async (post: { title: string; description: string; content?: string; hasImage?: boolean }) => {
    const imagePenaltyText = post.hasImage
      ? 'This post HAS an image.'
      : 'This post has NO image - subtract 5 points from interest_level.'

    const placeholders = {
      title: post.title,
      description: post.description || 'No description available',
      content: post.content ? post.content.substring(0, 1000) + '...' : 'No content available',
      imagePenalty: imagePenaltyText
    }

    return await callAIWithPrompt(
      'ai_prompt_content_evaluator',
      placeholders,
      FALLBACK_PROMPTS.contentEvaluator(post)
    )
  },

  newsletterWriter: async (post: { title: string; description: string; content?: string; source_url?: string }) => {
    const placeholders = {
      title: post.title,
      description: post.description || 'No description available',
      content: post.content ? post.content.substring(0, 1500) + '...' : 'No additional content',
      url: post.source_url || ''
    }

    return await callAIWithPrompt(
      'ai_prompt_newsletter_writer',
      placeholders,
      FALLBACK_PROMPTS.newsletterWriter(post)
    )
  },

  eventSummarizer: async (event: { title: string; description: string | null; venue?: string | null }) => {
    const placeholders = {
      title: event.title,
      description: event.description || 'No description available',
      venue: event.venue || 'No venue specified'
    }

    return await callAIWithPrompt(
      'ai_prompt_event_summary',
      placeholders,
      FALLBACK_PROMPTS.eventSummarizer(event)
    )
  },

  subjectLineGenerator: async (articles: Array<{ headline: string; content: string }>) => {
    const articlesText = articles
      .map((article, i) => `${i + 1}. ${article.headline}\n   ${article.content.substring(0, 100)}...`)
      .join('\n\n')

    const placeholders = {
      articles: articlesText
    }

    return await callAIWithPrompt(
      'ai_prompt_subject_line',
      placeholders,
      FALLBACK_PROMPTS.subjectLineGenerator(articles)
    )
  },

  topicDeduper: async (posts: Array<{ title: string; description: string }>) => {
    const articlesText = posts.map((post, i) =>
      `${i}. ${post.title}\n   ${post.description || 'No description'}`
    ).join('\n\n')

    const placeholders = {
      articles: articlesText
    }

    return await callAIWithPrompt(
      'ai_prompt_topic_deduper',
      placeholders,
      FALLBACK_PROMPTS.topicDeduper(posts)
    )
  },

  imageAnalyzer: async () => {
    return await callAIWithPrompt(
      'ai_prompt_image_analyzer',
      {},
      FALLBACK_PROMPTS.imageAnalyzer()
    )
  },

  // NOW EDITABLE (previously hardcoded)
  factChecker: async (newsletterContent: string, originalContent: string) => {
    const placeholders = {
      newsletterContent: newsletterContent,
      originalContent: originalContent.substring(0, 2000)
    }

    return await callAIWithPrompt(
      'ai_prompt_fact_checker',
      placeholders,
      FALLBACK_PROMPTS.factChecker(newsletterContent, originalContent)
    )
  },

  roadWorkGenerator: async (campaignDate: string) => {
    const placeholders = {
      campaignDate: campaignDate
    }

    return await callAIWithPrompt(
      'ai_prompt_road_work',
      placeholders,
      FALLBACK_PROMPTS.roadWorkGenerator(campaignDate)
    )
  },

  roadWorkValidator: async (roadWorkItems: any[], targetDate: string) => {
    const itemsText = roadWorkItems.map((item, i) => `
${i + 1}. ${item.road_name}
   Range: ${item.road_range || 'Not specified'}
   Location: ${item.city_or_township || 'Not specified'}
   Reason: ${item.reason || 'Not specified'}
   Start: ${item.start_date || 'Not specified'}
   Expected Reopen: ${item.expected_reopen || 'Not specified'}
   Source: ${item.source_url || 'Not specified'}
`).join('\n')

    const placeholders = {
      targetDate: targetDate,
      currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      items: itemsText
    }

    return await callAIWithPrompt(
      'ai_prompt_road_work_validator',
      placeholders,
      FALLBACK_PROMPTS.roadWorkValidator(roadWorkItems, targetDate)
    )
  }
}
```

---

## Phase 3: Database Prompt Migration

### Migrate All 9 Prompts to Database

Create migration script: `scripts/migrate-prompts.ts`

```typescript
import { supabaseAdmin } from '../src/lib/supabase'
import { FALLBACK_PROMPTS } from '../src/lib/openai'

interface PromptConfig {
  key: string
  name: string
  description: string
  category: string
  value: any
  ai_provider: 'openai' | 'perplexity'
}

const prompts: PromptConfig[] = [
  // 1. Content Evaluator
  {
    key: 'ai_prompt_content_evaluator',
    name: 'Content Evaluator',
    description: 'Scores articles for newsletter inclusion (interest, relevance, impact)',
    category: 'Article Generation',
    ai_provider: 'openai',
    value: {
      model: 'gpt-4o',
      temperature: 0.3,
      max_output_tokens: 1000,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ArticleScoring',
          schema: {
            type: 'object',
            properties: {
              interest_level: { type: 'number' },
              local_relevance: { type: 'number' },
              community_impact: { type: 'number' },
              reasoning: { type: 'string' }
            },
            required: ['interest_level', 'local_relevance', 'community_impact', 'reasoning'],
            additionalProperties: false
          },
          strict: true
        }
      },
      messages: [
        {
          role: 'system',
          content: `You are evaluating a news article for inclusion in a local St. Cloud, Minnesota newsletter.

CRITICAL: You MUST use these exact scoring scales:
- interest_level: Integer between 1 and 20 (NOT 1-10, MUST BE 1-20)
- local_relevance: Integer between 1 and 10
- community_impact: Integer between 1 and 10

IMAGE PENALTY: {{imagePenalty}}

INTEREST LEVEL (1-20 scale, NOT 1-10):
Rate from 1 to 20 where 20 is most interesting. Use the full range 1-20.
HIGH SCORING (15-20): Unexpected developments, human interest stories, breaking news, unique events, broad appeal, fun/entertaining
MEDIUM SCORING (8-14): Standard local news, business updates, routine events with some appeal
LOW SCORING (1-7): Routine announcements, technical/administrative content, repetitive topics, purely promotional, very short content

LOCAL RELEVANCE (1-10 scale):
How directly relevant is this to St. Cloud area residents?
HIGH SCORING (7-10): Events/news in St. Cloud and surrounding areas (Waite Park, Sartell, Sauk Rapids, Cold Spring), Stearns County government decisions, local business changes, school district news, local infrastructure/development, community events
LOW SCORING (1-6): State/national news without local angle, events far from St. Cloud area, generic content not location-specific

COMMUNITY IMPACT (1-10 scale):
How much does this affect local residents' daily lives or community?
HIGH SCORING (7-10): New services or amenities, policy changes affecting residents, public safety information, economic development/job creation, community services and resources
LOW SCORING (1-6): Individual achievements with limited community effect, internal organizational matters, entertainment without broader impact

BONUS: Add 2 extra points to total_score for stories mentioning multiple local communities or regional impact.

BLANK RATING CONDITIONS: Leave all fields blank if:
- Description contains ≤10 words
- Post is about weather happening today/tomorrow
- Post is written before an event happening "today"/"tonight"/"this evening"
- Post mentions events happening "today", "tonight", or "this evening" (we do not include same-day events)
- Post is about lost, missing, or found pets (lost dogs, cats, etc.)
- Post is about incidents currently happening, ongoing emergencies, or breaking news that will be outdated by tomorrow (accidents, police responses, active situations, traffic incidents, emergency responses)`
        },
        {
          role: 'user',
          content: `Article Title: {{title}}
Article Description: {{description}}
Article Content: {{content}}

IMPORTANT: You must respond with ONLY valid JSON. Do not include any text before or after the JSON.
The interest_level field MUST be between 1 and 20, NOT between 1 and 10.`
        }
      ]
    }
  },

  // 2. Newsletter Writer
  {
    key: 'ai_prompt_newsletter_writer',
    name: 'Newsletter Writer',
    description: 'Generates 40-75 word article summaries for newsletter',
    category: 'Article Generation',
    ai_provider: 'openai',
    value: {
      model: 'gpt-4o',
      temperature: 0.7,
      max_output_tokens: 500,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ArticleContent',
          schema: {
            type: 'object',
            properties: {
              headline: { type: 'string' },
              content: { type: 'string' },
              word_count: { type: 'number' }
            },
            required: ['headline', 'content', 'word_count'],
            additionalProperties: false
          },
          strict: true
        }
      },
      messages: [
        {
          role: 'system',
          content: `CRITICAL: You are writing a news article that MUST follow strict content rules. Violations will result in rejection.

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
✓ Included no editorial commentary`
        },
        {
          role: 'user',
          content: `Original Source Post:
Title: {{title}}
Description: {{description}}
Content: {{content}}`
        }
      ]
    }
  },

  // 3. Topic Deduper
  {
    key: 'ai_prompt_topic_deduper',
    name: 'Topic Deduper',
    description: 'Identifies duplicate stories and similar topics',
    category: 'Article Generation',
    ai_provider: 'openai',
    value: {
      model: 'gpt-4o',
      temperature: 0.3,
      max_output_tokens: 1500,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'DeduplicationResult',
          schema: {
            type: 'object',
            properties: {
              groups: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    topic_signature: { type: 'string' },
                    primary_article_index: { type: 'number' },
                    duplicate_indices: { type: 'array', items: { type: 'number' } },
                    similarity_explanation: { type: 'string' }
                  },
                  required: ['topic_signature', 'primary_article_index', 'duplicate_indices', 'similarity_explanation'],
                  additionalProperties: false
                }
              },
              unique_articles: { type: 'array', items: { type: 'number' } }
            },
            required: ['groups', 'unique_articles'],
            additionalProperties: false
          },
          strict: true
        }
      },
      messages: [
        {
          role: 'system',
          content: `You are identifying duplicate stories for a LOCAL NEWSLETTER. Your goal is to prevent readers from seeing multiple articles about the SAME TYPE OF EVENT or SIMILAR TOPICS.

CRITICAL DEDUPLICATION RULES:
1. Group articles about the SAME TYPE of event (e.g., multiple fire department open houses, multiple school events, multiple business openings)
2. Group articles covering the SAME news story from different sources
3. Group articles about SIMILAR community activities happening in the same time period
4. Be AGGRESSIVE in identifying duplicates - err on the side of grouping similar topics together
5. For each group, keep the article with the MOST SPECIFIC details (names, dates, locations)

EXAMPLES OF DUPLICATES:
- "Sartell Fire Dept Open House Oct 12" + "St. Cloud Fire Station Open House Oct 12" + "Sauk Rapids Fire Dept Open House Oct 12" → ALL DUPLICATES (same type of event)
- "New restaurant opens in St. Cloud" + "Grand opening for local eatery" → DUPLICATES (same story)
- "School district meeting tonight" + "Board to discuss budget tonight" → DUPLICATES (same event)

IMPORTANT: Use 0-based indexing (first article = 0, second = 1, etc.)`
        },
        {
          role: 'user',
          content: `Articles to analyze (array indices are 0-based - first article is index 0):
{{articles}}`
        }
      ]
    }
  },

  // 4. Subject Line Generator
  {
    key: 'ai_prompt_subject_line',
    name: 'Subject Line Generator',
    description: 'Creates ≤40 character email subject lines',
    category: 'Newsletter Formatting',
    ai_provider: 'openai',
    value: {
      model: 'gpt-4o',
      temperature: 0.8,
      max_output_tokens: 100,
      messages: [
        {
          role: 'system',
          content: `Craft a front-page newspaper headline for the next-day edition based on the most interesting article.

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

Respond with ONLY the headline text - no JSON, no quotes, no extra formatting. Just the headline itself.`
        },
        {
          role: 'user',
          content: `Articles in this newsletter:
{{articles}}`
        }
      ]
    }
  },

  // 5. Event Summarizer
  {
    key: 'ai_prompt_event_summary',
    name: 'Event Summarizer',
    description: 'Creates 50-word event descriptions',
    category: 'Newsletter Formatting',
    ai_provider: 'openai',
    value: {
      model: 'gpt-4o',
      temperature: 0.7,
      max_output_tokens: 200,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'EventSummary',
          schema: {
            type: 'object',
            properties: {
              event_summary: { type: 'string' },
              word_count: { type: 'number' }
            },
            required: ['event_summary', 'word_count'],
            additionalProperties: false
          },
          strict: true
        }
      },
      messages: [
        {
          role: 'system',
          content: `Rewrite the description field into a concise, natural-language highlight of 50 words or fewer. Do not copy or truncate the first words; paraphrase so it reads well.

REQUIREMENTS:
- Maximum 50 words
- Natural, engaging language
- Paraphrase completely - don't copy original wording
- Capture the essence and appeal of the event
- Write in third person
- Include key details that make it interesting`
        },
        {
          role: 'user',
          content: `Event Title: {{title}}
Event Description: {{description}}
Event Venue: {{venue}}`
        }
      ]
    }
  },

  // 6. Image Analyzer
  {
    key: 'ai_prompt_image_analyzer',
    name: 'Image Analyzer',
    description: 'Analyzes images for tagging and OCR extraction',
    category: 'Content Analysis',
    ai_provider: 'openai',
    value: {
      model: 'gpt-4o',
      temperature: 0.5,
      max_output_tokens: 2000,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ImageAnalysis',
          schema: {
            type: 'object',
            properties: {
              caption: { type: 'string' },
              alt_text: { type: 'string' },
              tags_scored: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    name: { type: 'string' },
                    conf: { type: 'number' }
                  },
                  required: ['type', 'name', 'conf'],
                  additionalProperties: false
                }
              },
              top_tags: { type: 'array', items: { type: 'string' } },
              ocr_text: { type: ['string', 'null'] },
              text_density: { type: 'number' },
              ocr_entities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    name: { type: 'string' },
                    conf: { type: 'number' }
                  },
                  required: ['type', 'name', 'conf'],
                  additionalProperties: false
                }
              },
              signage_conf: { type: 'number' },
              age_groups: {
                type: ['array', 'null'],
                items: {
                  type: 'object',
                  properties: {
                    age_group: { type: 'string' },
                    count: { type: 'number' },
                    conf: { type: 'number' }
                  },
                  required: ['age_group', 'count', 'conf'],
                  additionalProperties: false
                }
              }
            },
            required: ['caption', 'alt_text', 'tags_scored', 'top_tags', 'ocr_text', 'text_density', 'ocr_entities', 'signage_conf', 'age_groups'],
            additionalProperties: false
          },
          strict: true
        }
      },
      messages: [
        {
          role: 'system',
          content: `Analyze this image for a St. Cloud, Minnesota local newsletter. Focus on identifying elements relevant to community news, events, education, public safety, healthcare, sports, business development, seasonal activities, and local landmarks.

GUIDELINES:
- Caption: Natural, descriptive sentence about the image contents
- Alt text: 10-14 words maximum, accessible description for screen readers
- Tags scored: Array of categorized tags with confidence scores (0-1)
- Tag types: location, venue, scene, event_type, sport, season, object, safety, mood, activity
- Tag names: concrete nouns, lowercase with underscores
- Top tags: 5-15 most relevant tags in "type_name" format
- Include safety.has_text if text/signage is visible
- Confidence scores reflect certainty (0.9+ for obvious, 0.5-0.8 for likely, <0.5 for uncertain)
- Focus on concrete, visible elements rather than abstract concepts
- Mood tags: emotional atmosphere/feeling conveyed (happy, energetic, calm, serious, playful, etc.)

ST. CLOUD SPECIFIC TAGGING PRIORITIES:
Prioritize identifying and tagging these high-value categories for St. Cloud newsletter:

LOCATIONS & VENUES:
- Educational: apollo_high_school, scsu_campus, kennedy_school, talahi_school, college_of_saint_benedict
- Parks: lake_george, munsinger_gardens, clemens_gardens, quarry_park, wilson_park
- Downtown: downtown_st_cloud, jules_bistro, caribou_coffee, bad_habit_brewing
- Public Safety: fire_station, police_station, sartell_public_safety
- Healthcare: centracare_hospital, medical_facility, clinic
- Government: city_hall, county_building, district_office
- Sports Venues: herb_brooks_hockey_center, arena, gymnasium, athletic_field

EVENT TYPES:
- Community: ribbon_cutting, open_house, walkathon, festival, parade
- Sports: hockey_game, volleyball_match, soccer_game, basketball_game
- Education: school_spirit, graduation, classroom_activity
- Public Safety: fire_demonstration, police_k9, emergency_response
- Arts: theatre_performance, art_class, museum_exhibit
- Fundraising: charity_event, donation_activity, volunteer_work

SEASONAL MARKERS:
- Fall: autumn_foliage, pumpkins, halloween, harvest, golden_leaves
- Winter: snow, ice, hockey, winter_sports, holiday_lights
- Spring: flowers, gardens, blooming, renewal
- Summer: outdoor_events, lakes, recreation, sunshine

SPORTS & RECREATION:
- Hockey: husky_hockey, youth_hockey, ice_rink, hockey_equipment
- Other Sports: volleyball, soccer, basketball, athletics
- Recreation: walking_trails, bike_paths, playground, outdoor_activities

PUBLIC SAFETY & COMMUNITY:
- Fire: fire_truck, firefighter, fire_station_3, emergency_vehicle
- Police: police_cruiser, k9_unit, officer, patrol_vehicle
- Security: surveillance_camera, locked_door, safety_equipment
- Health: vaccination, medical_staff, hospital_equipment

BUSINESS & DEVELOPMENT:
- Construction: groundbreaking, road_work, building_construction, heavy_equipment
- Business: restaurant, retail, hotel, office_building
- Infrastructure: road_closed_sign, detour, traffic_control, maintenance

OCR ANALYSIS:
- ocr_text: Extract ALL readable text from the image, convert to lowercase, normalize spacing
- text_density: Estimate what percentage of the image area is covered by text (0.0 to 1.0)
- ocr_entities: Extract named entities from the OCR text using these types:
  * ORG: Organizations, businesses, government agencies (e.g., "st cloud state university", "centracare", "apollo high school")
  * PERSON: People's names
  * LOC: Locations, addresses, place names (e.g., "lake george", "downtown st cloud", "sartell")
  * DATE: Dates, times, temporal references
  * TIME: Specific times, hours
  * MISC: Other important entities (phone numbers, websites, street names)
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

IMPORTANT: Only include OCR fields if readable text is actually present. Only include age_groups if people are visible and ages can be reasonably estimated. Set to null if not detected. Prioritize tags that match the St. Cloud newsletter's common article themes: education, public safety, community events, sports (especially hockey), seasonal activities, business development, and healthcare.`
        }
      ]
    }
  },

  // 7. Fact Checker (NOW EDITABLE)
  {
    key: 'ai_prompt_fact_checker',
    name: 'Fact Checker',
    description: 'Validates articles follow content rules and match source material',
    category: 'Article Validation',
    ai_provider: 'openai',
    value: {
      model: 'gpt-4o',
      temperature: 0.3,
      max_output_tokens: 1000,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'FactCheckResult',
          schema: {
            type: 'object',
            properties: {
              score: { type: 'number' },
              details: { type: 'string' },
              passed: { type: 'boolean' }
            },
            required: ['score', 'details', 'passed'],
            additionalProperties: false
          },
          strict: true
        }
      },
      messages: [
        {
          role: 'system',
          content: `CRITICAL FACT-CHECK: Verify this newsletter article follows strict content rules and contains no violations.

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
PASSING THRESHOLD: 20/30 minimum`
        },
        {
          role: 'user',
          content: `Newsletter Article:
{{newsletterContent}}

Original Source Material:
{{originalContent}}`
        }
      ]
    }
  },

  // 8. Road Work Generator (NOW EDITABLE)
  {
    key: 'ai_prompt_road_work',
    name: 'Road Work Generator',
    description: 'Finds current road closures and construction in St. Cloud area',
    category: 'Road Work Section',
    ai_provider: 'perplexity',
    value: {
      model: 'llama-3.1-sonar-large-128k-online',
      temperature: 0,
      max_output_tokens: 3000,
      messages: [
        {
          role: 'system',
          content: `You are a research assistant finding CURRENT and ACTIVE road, lane, or bridge closures, detours, or traffic restrictions in the St. Cloud, MN metro area.

CRITICAL DATE REQUIREMENT:
- ONLY include projects that are ACTIVE on the target date
- Expected reopen date must be AFTER the target date (not completed yet)
- Start date must be ON OR BEFORE the target date (already begun)
- Do NOT include completed projects from summer 2025 or earlier
- MUST have CONFIRMED specific dates (e.g., "Oct 15", "Nov 30") - NO vague ranges like "Fall 2026" or "TBD"
- REJECT any items with unconfirmed or vague date ranges

INCLUDE ALL TYPES:
- Full closures, lane closures, bridge closures, detours, major traffic restrictions
- Current closures from all road types (state, county, city streets)
- Direction-specific lane closures (e.g., westbound/eastbound only)
- Segment-specific impacts within larger projects
- Construction impacts, travel advisories, traffic alerts, detour notices
- Bus route detours and public transit impacts
- Utility construction causing traffic restrictions
- Intermittent lane closures and periodic restrictions
- Water main work, pipeline work, road reconstruction
- Cold patching, resurfacing, maintenance work affecting traffic

EXPLICITLY INCLUDE:
- State highways: Hwy 55, Hwy 15, Hwy 10, Hwy 23
- County Roads in the area
- Closures in nearby cities: Sartell, Waite Park, St. Joseph, St. Augusta, Sauk Rapids
- Metro Bus route detours and schedule changes
- All types of construction projects (roundabouts, bridges, resurfacing)
- Projects that started before target date but are still ongoing

STRICTLY EXCLUDE:
- Completed closures (reopen date before target date)
- Planned/future closures (start date after target date)
- Summer 2025 projects that ended in August or earlier
- Shoulder-only work with no traffic impact

REQUIRED SOURCES TO CHECK:
- https://www.dot.state.mn.us/d3/ (MnDOT District 3)
- https://www.stearnscountymn.gov/185/Public-Works
- https://www.co.benton.mn.us/180/Highway
- https://www.co.sherburne.mn.us/162/Public-Works
- https://www.ci.stcloud.mn.us (St. Cloud)
- https://www.cityofsartell.com/engineering/
- https://www.cityofstjoseph.com/
- https://www.ci.waitepark.mn.us/
- https://ci.sauk-rapids.mn.us/
- https://www.ridemetrobus.com (Metro Bus)
- Local media: WJON Traffic, St. Cloud Times Roads section
- 511mn.org (Minnesota road conditions)

TARGET: Find 6-9 different road work entries with CONFIRMED dates. Prioritize accuracy over volume - better to return fewer items with confirmed dates than more items with vague dates.`
        },
        {
          role: 'user',
          content: `Find CURRENT and ACTIVE road, lane, or bridge closures, detours, or traffic restrictions in effect on {{campaignDate}} within 10 miles of ZIP code 56303 (St. Cloud, MN metro area).

Date: {{campaignDate}}
Location: Within 10 miles of ZIP 56303 (St. Cloud, MN metro area)

REQUIRED OUTPUT FORMAT:
Return ONLY a JSON array. Include as many real closures as found with confirmed dates (aim for 6-9 entries, but quality over quantity).

[
{"road_name":"[actual road name]","road_range":"from [start] to [end]","city_or_township":"[actual city]","reason":"[actual reason from source]","start_date":"[specific date like Oct 15]","expected_reopen":"[specific date like Nov 30]","source_url":"[actual URL where info was found]"}
]

CRITICAL REQUIREMENTS:
- Only return real, verified road work from actual government sources
- MUST have confirmed specific dates - NO "TBD", "Fall 2026", or vague ranges
- Better to return 3-4 items with confirmed dates than 9 items with vague dates
- Include minor impacts like lane restrictions, not just major closures
- Each item must be currently active on the target date`
        }
      ]
    }
  },

  // 9. Road Work Validator (NOW EDITABLE)
  {
    key: 'ai_prompt_road_work_validator',
    name: 'Road Work Validator',
    description: 'Validates road work data for accuracy and date relevance',
    category: 'Road Work Section',
    ai_provider: 'openai',
    value: {
      model: 'gpt-4o',
      temperature: 0.3,
      max_output_tokens: 1500,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ValidationResult',
          schema: {
            type: 'object',
            properties: {
              validated_items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'number' },
                    valid: { type: 'boolean' },
                    reason: { type: 'string' },
                    confidence: { type: 'number' }
                  },
                  required: ['index', 'valid', 'reason', 'confidence'],
                  additionalProperties: false
                }
              },
              summary: {
                type: 'object',
                properties: {
                  total_items: { type: 'number' },
                  valid_items: { type: 'number' },
                  invalid_items: { type: 'number' },
                  accuracy_score: { type: 'number' }
                },
                required: ['total_items', 'valid_items', 'invalid_items', 'accuracy_score'],
                additionalProperties: false
              }
            },
            required: ['validated_items', 'summary'],
            additionalProperties: false
          },
          strict: true
        }
      },
      messages: [
        {
          role: 'system',
          content: `You are validating road work data for accuracy and relevance. Review each item and determine if it should be included in the newsletter.

VALIDATION CRITERIA - Mark as INVALID if:
1. **Unconfirmed Dates**: Start date or expected reopen is "TBD", "To be determined", "Not specified", or similar vague language
2. **Already Completed**: Expected reopen date is before target date
3. **Not Yet Started**: Start date is after target date
4. **Vague Date Ranges**: Uses phrases like "Spring 2026", "Late Summer", "Fall", without specific month/day
5. **Old Projects**: Any indication the project is from a previous year that has already passed
6. **Missing Critical Info**: No road name, no location, or no reason specified
7. **Placeholder Content**: Generic entries like "No additional closures" or "TBD"

VALIDATION CRITERIA - Mark as VALID if:
1. **Confirmed Dates**: Has specific month/day format (e.g., "Oct 15", "Nov 30")
2. **Currently Active**: Start date is on or before target date AND expected reopen is after target date
3. **Real Project**: Has specific road name, location, reason, and source URL
4. **Verifiable**: Source URL points to government website (MnDOT, county, city)

For each item, provide:
- valid: true/false
- reason: Brief explanation of why it passed or failed validation
- confidence: 0-1 score (1.0 = certain, 0.5 = uncertain)`
        },
        {
          role: 'user',
          content: `Target Date: {{targetDate}}
Current Date: {{currentDate}}

Road Work Items to Validate:
{{items}}`
        }
      ]
    }
  }
]

async function migratePrompts() {
  console.log('🚀 Starting prompt migration...\n')

  for (const prompt of prompts) {
    try {
      console.log(`Migrating: ${prompt.name} (${prompt.key})`)

      const { error } = await supabaseAdmin
        .from('app_settings')
        .upsert({
          key: prompt.key,
          value: prompt.value,
          description: prompt.description,
          ai_provider: prompt.ai_provider,
          updated_at: new Date().toISOString()
        })

      if (error) {
        console.error(`❌ Failed to migrate ${prompt.key}:`, error)
      } else {
        console.log(`✅ Migrated ${prompt.key}`)
      }
    } catch (error) {
      console.error(`❌ Error migrating ${prompt.key}:`, error)
    }
  }

  console.log('\n✅ Prompt migration complete!')
}

migratePrompts()
```

Run migration:
```bash
npx ts-node scripts/migrate-prompts.ts
```

---

## Phase 4: Settings Page Enhancement

### File: `src/app/dashboard/settings/page.tsx`

Update `AIPromptsSettings` component:

```typescript
function AIPromptsSettings() {
  const [prompts, setPrompts] = useState<any[]>([])
  const [grouped, setGrouped] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<{key: string, value: string, ai_provider: 'openai' | 'perplexity'} | null>(null)

  // Test modal state
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testResults, setTestResults] = useState<any>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)

  useEffect(() => {
    loadPrompts()
  }, [])

  const loadPrompts = async () => {
    try {
      const response = await fetch('/api/settings/ai-prompts')
      if (response.ok) {
        const data = await response.json()
        setPrompts(data.prompts || [])
        setGrouped(data.grouped || {})
      }
    } catch (error) {
      console.error('Failed to load AI prompts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (prompt: any) => {
    const formattedValue = typeof prompt.value === 'string'
      ? prompt.value
      : JSON.stringify(prompt.value, null, 2)

    setEditingPrompt({
      key: prompt.key,
      value: formattedValue,
      ai_provider: prompt.ai_provider || 'openai'
    })
    setExpandedPrompt(prompt.key)
  }

  const handleSave = async (key: string) => {
    if (!editingPrompt || editingPrompt.key !== key) return

    setSaving(key)
    setMessage('')

    try {
      let valueToSave: any = editingPrompt.value

      try {
        const parsed = JSON.parse(editingPrompt.value)
        if (parsed && typeof parsed === 'object' && parsed.messages && Array.isArray(parsed.messages)) {
          valueToSave = parsed
        }
      } catch (parseError) {
        // Plain text prompt
      }

      const response = await fetch('/api/settings/ai-prompts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: editingPrompt.key,
          value: valueToSave,
          ai_provider: editingPrompt.ai_provider
        })
      })

      if (response.ok) {
        setMessage('Prompt saved successfully!')
        setEditingPrompt(null)
        await loadPrompts()
        setTimeout(() => setMessage(''), 3000)
      } else {
        throw new Error('Failed to save prompt')
      }
    } catch (error) {
      setMessage('Error: Failed to save prompt')
      setTimeout(() => setMessage(''), 5000)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">AI Prompt Management</h3>
        <p className="text-sm text-blue-800">
          All AI prompts are stored as complete JSON API requests in the database.
          Edit prompts, test them with real data, and switch between OpenAI and Perplexity providers.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, categoryPrompts]) => (
            <div key={category} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{category}</h3>
              <div className="space-y-4">
                {categoryPrompts.map((prompt) => (
                  <div key={prompt.key} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-medium text-gray-900">{prompt.name}</h4>
                        <p className="text-sm text-gray-600">{prompt.description}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Provider Badge */}
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          prompt.ai_provider === 'perplexity'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {prompt.ai_provider === 'perplexity' ? 'Perplexity' : 'OpenAI'}
                        </span>
                      </div>
                    </div>

                    {expandedPrompt === prompt.key && editingPrompt?.key === prompt.key ? (
                      <div className="mt-4">
                        {/* AI Provider Selector */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            AI Provider
                          </label>
                          <div className="flex gap-4">
                            <button
                              onClick={() => editingPrompt && setEditingPrompt({ ...editingPrompt, ai_provider: 'openai' })}
                              className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                                editingPrompt?.ai_provider === 'openai'
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              OpenAI
                            </button>
                            <button
                              onClick={() => editingPrompt && setEditingPrompt({ ...editingPrompt, ai_provider: 'perplexity' })}
                              className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                                editingPrompt?.ai_provider === 'perplexity'
                                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              Perplexity
                            </button>
                          </div>
                        </div>

                        {/* Format Indicator */}
                        <div className="mb-2 text-sm text-gray-600">
                          {(() => {
                            try {
                              const parsed = JSON.parse(editingPrompt.value)
                              return parsed.messages && Array.isArray(parsed.messages) ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-100 text-green-800">
                                  ✓ Structured JSON Format
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-md bg-yellow-100 text-yellow-800">
                                  ⚠ Plain Text Format
                                </span>
                              )
                            } catch {
                              return (
                                <span className="inline-flex items-center px-2 py-1 rounded-md bg-red-100 text-red-800">
                                  ✗ Invalid JSON
                                </span>
                              )
                            }
                          })()}
                        </div>

                        <textarea
                          value={editingPrompt?.value || ''}
                          onChange={(e) => editingPrompt && setEditingPrompt({ ...editingPrompt, value: e.target.value })}
                          rows={15}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <div className="mt-3 flex items-center justify-between">
                          <button
                            onClick={() => handleTestPrompt(prompt.key)}
                            disabled={testLoading}
                            className="px-4 py-2 text-sm font-medium text-purple-700 bg-white border border-purple-300 rounded-md hover:bg-purple-50 disabled:opacity-50"
                          >
                            {testLoading ? 'Testing...' : 'Test Prompt'}
                          </button>
                          <div className="flex items-center space-x-3">
                            <button
                              onClick={() => setEditingPrompt(null)}
                              disabled={saving === prompt.key}
                              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSave(prompt.key)}
                              disabled={saving === prompt.key}
                              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                              {saving === prompt.key ? 'Saving...' : 'Save Changes'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center space-x-2">
                        <button
                          onClick={() => handleEdit(prompt)}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                        >
                          Edit Prompt
                        </button>
                        <button
                          onClick={() => handleReset(prompt.key)}
                          disabled={saving === prompt.key}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                        >
                          Reset to Default
                        </button>
                        <button
                          onClick={() => handleSaveAsDefault(prompt.key)}
                          disabled={saving === prompt.key}
                          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                        >
                          Save as Default
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {message && (
        <div className={`mt-4 p-4 rounded-md ${
          message.includes('successfully')
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}
```

---

## Phase 5: API Endpoints

### File: `src/app/api/settings/ai-prompts/route.ts`

Update to handle `ai_provider`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { FALLBACK_PROMPTS } from '@/lib/openai'

// GET /api/settings/ai-prompts
export async function GET(request: NextRequest) {
  try {
    const { data: settings, error } = await supabaseAdmin
      .from('app_settings')
      .select('key, value, description, ai_provider')
      .like('key', 'ai_prompt_%')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const prompts = (settings || []).map(setting => ({
      key: setting.key,
      name: getPromptName(setting.key),
      description: setting.description || 'No description',
      value: setting.value,
      ai_provider: setting.ai_provider || 'openai',
      category: getPromptCategory(setting.key)
    }))

    // Group by category
    const grouped = prompts.reduce((acc, prompt) => {
      if (!acc[prompt.category]) {
        acc[prompt.category] = []
      }
      acc[prompt.category].push(prompt)
      return acc
    }, {} as Record<string, any[]>)

    return NextResponse.json({
      prompts,
      grouped
    })
  } catch (error) {
    console.error('Error loading AI prompts:', error)
    return NextResponse.json({ error: 'Failed to load prompts' }, { status: 500 })
  }
}

// PATCH /api/settings/ai-prompts
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { key, value, ai_provider } = body

    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('app_settings')
      .update({
        value,
        ai_provider: ai_provider || 'openai',
        updated_at: new Date().toISOString()
      })
      .eq('key', key)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving AI prompt:', error)
    return NextResponse.json({ error: 'Failed to save prompt' }, { status: 500 })
  }
}

// POST /api/settings/ai-prompts (Reset to default or Save as default)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { key, action } = body

    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    }

    if (action === 'save_as_default') {
      // Save current value as custom default
      const { data: currentPrompt } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .single()

      if (currentPrompt) {
        const { error } = await supabaseAdmin
          .from('app_settings')
          .update({
            custom_default: typeof currentPrompt.value === 'string'
              ? currentPrompt.value
              : JSON.stringify(currentPrompt.value),
            updated_at: new Date().toISOString()
          })
          .eq('key', key)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
      }
    } else {
      // Reset to default (custom default or code default)
      const { data: settings } = await supabaseAdmin
        .from('app_settings')
        .select('custom_default')
        .eq('key', key)
        .single()

      let defaultValue
      let usedCustomDefault = false

      if (settings?.custom_default) {
        // Use custom default
        try {
          defaultValue = JSON.parse(settings.custom_default)
          usedCustomDefault = true
        } catch {
          defaultValue = settings.custom_default
          usedCustomDefault = true
        }
      } else {
        // Use code default
        defaultValue = getCodeDefaultPrompt(key)
      }

      const { error } = await supabaseAdmin
        .from('app_settings')
        .update({
          value: defaultValue,
          updated_at: new Date().toISOString()
        })
        .eq('key', key)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        used_custom_default: usedCustomDefault
      })
    }
  } catch (error) {
    console.error('Error resetting AI prompt:', error)
    return NextResponse.json({ error: 'Failed to reset prompt' }, { status: 500 })
  }
}

function getPromptName(key: string): string {
  const names: Record<string, string> = {
    'ai_prompt_content_evaluator': 'Content Evaluator',
    'ai_prompt_newsletter_writer': 'Newsletter Writer',
    'ai_prompt_topic_deduper': 'Topic Deduper',
    'ai_prompt_subject_line': 'Subject Line Generator',
    'ai_prompt_event_summary': 'Event Summarizer',
    'ai_prompt_image_analyzer': 'Image Analyzer',
    'ai_prompt_fact_checker': 'Fact Checker',
    'ai_prompt_road_work': 'Road Work Generator',
    'ai_prompt_road_work_validator': 'Road Work Validator'
  }
  return names[key] || key
}

function getPromptCategory(key: string): string {
  if (key.includes('content_evaluator') || key.includes('newsletter_writer') || key.includes('topic_deduper')) {
    return 'Article Generation'
  }
  if (key.includes('subject_line') || key.includes('event_summary')) {
    return 'Newsletter Formatting'
  }
  if (key.includes('image_analyzer')) {
    return 'Content Analysis'
  }
  if (key.includes('fact_checker')) {
    return 'Article Validation'
  }
  if (key.includes('road_work')) {
    return 'Road Work Section'
  }
  return 'Other'
}

function getCodeDefaultPrompt(key: string): any {
  // Return code default from FALLBACK_PROMPTS
  // This function should construct the complete JSON prompt
  // based on the key using FALLBACK_PROMPTS
  return null // Implement based on your fallback prompts
}
```

---

## Phase 6: RSS Ingestion Hourly

### File: `src/app/api/cron/ingest-rss/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { RSSProcessor } from '@/lib/rss-processor'

/**
 * RSS Ingestion Cron
 * Runs every hour to keep RSS posts table fresh
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check (Vercel cron or manual with secret)
    const searchParams = new URL(request.url).searchParams
    const secret = searchParams.get('secret')

    const isVercelCron = !secret && !searchParams.has('secret')
    const isManualTest = secret === process.env.CRON_SECRET

    if (!isVercelCron && !isManualTest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[RSS Ingest] Starting hourly RSS ingestion')

    // Get all active RSS feeds for St. Cloud Scoop
    const { data: feeds, error: feedsError } = await supabaseAdmin
      .from('rss_feeds')
      .select('*')
      .eq('active', true)

    if (feedsError || !feeds || feeds.length === 0) {
      console.log('[RSS Ingest] No active feeds found')
      return NextResponse.json({
        success: true,
        message: 'No active feeds',
        processed: 0
      })
    }

    console.log(`[RSS Ingest] Processing ${feeds.length} St. Cloud RSS feeds`)

    const processor = new RSSProcessor()
    let totalPosts = 0
    let totalNewPosts = 0

    // Process each feed
    for (const feed of feeds) {
      try {
        const posts = await processor.fetchAndParseFeed(feed.url)

        // Save posts to database (handles duplicates automatically)
        const result = await processor.savePosts(posts, feed.id)

        totalPosts += posts.length
        totalNewPosts += result.newPosts || 0
        console.log(`[RSS Ingest] Feed ${feed.name}: ${posts.length} posts (${result.newPosts || 0} new)`)
      } catch (error) {
        console.error(`[RSS Ingest] Error processing ${feed.name}:`, error)
        // Continue with next feed
      }
    }

    console.log(`[RSS Ingest] Complete: ${totalPosts} total posts, ${totalNewPosts} new posts`)

    return NextResponse.json({
      success: true,
      message: `Processed ${feeds.length} feeds`,
      totalPosts,
      totalNewPosts,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[RSS Ingest] Failed:', error)
    return NextResponse.json({
      error: 'RSS ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const maxDuration = 300  // 5 minutes
```

---

## Phase 7: 7-Step Workflow

### Install Vercel Workflow SDK

```bash
npm install workflow
```

### File: `src/lib/workflows/process-rss-workflow.ts`

```typescript
import { supabaseAdmin } from '@/lib/supabase'
import { RSSProcessor } from '@/lib/rss-processor'

/**
 * St. Cloud Scoop RSS Processing Workflow
 * 7-step workflow with individual 800-second timeouts per step
 *
 * Single "Local Scoop" article section (10 articles, 2 batches of 5)
 */
export async function processRSSWorkflow(input: {
  trigger: 'cron' | 'manual'
}) {
  "use workflow"

  let campaignId: string

  console.log('[Workflow] Starting St. Cloud Scoop newsletter processing')

  // STEP 1: Setup - Create campaign, select top 15, deduplicate
  campaignId = await setupCampaign()

  // LOCAL SCOOP ARTICLES
  // STEP 2: Generate 5 Local Scoop articles (batch 1)
  await generateArticlesBatch1(campaignId)

  // STEP 3: Generate 5 Local Scoop articles (batch 2)
  await generateArticlesBatch2(campaignId)

  // STEP 4: Fact-check all 10 articles
  await factCheckArticles(campaignId)

  // ADDITIONAL SECTIONS
  // STEP 5: Populate events (8 events per day, random selection)
  await populateEvents(campaignId)

  // STEP 6: Generate road work section (9 items)
  await generateRoadWork(campaignId)

  // STEP 7: Finalize - Select top articles, generate subject line, create welcome
  await finalizeCampaign(campaignId)

  console.log('=== WORKFLOW COMPLETE ===')

  return { campaignId, success: true }
}

// Step 1: Setup
async function setupCampaign() {
  "use step"

  console.log('[Workflow Step 1/7] Setting up campaign...')

  const processor = new RSSProcessor()

  // Calculate campaign date (Central Time + 12 hours)
  const nowCentral = new Date().toLocaleString("en-US", {timeZone: "America/Chicago"})
  const centralDate = new Date(nowCentral)
  centralDate.setHours(centralDate.getHours() + 12)
  const campaignDate = centralDate.toISOString().split('T')[0]

  // Create new campaign
  const { data: newCampaign, error: createError } = await supabaseAdmin
    .from('newsletter_campaigns')
    .insert([{
      date: campaignDate,
      status: 'processing'
    }])
    .select('id')
    .single()

  if (createError || !newCampaign) {
    throw new Error('Failed to create campaign')
  }

  const id = newCampaign.id
  console.log(`[Workflow Step 1/7] Campaign created: ${id} for ${campaignDate}`)

  // Get lookback window (default 72 hours)
  const { data: lookbackSetting } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'primary_article_lookback_hours')
    .single()

  const lookbackHours = lookbackSetting ? parseInt(lookbackSetting.value) : 72
  const lookbackDate = new Date()
  lookbackDate.setHours(lookbackDate.getHours() - lookbackHours)
  const lookbackTimestamp = lookbackDate.toISOString()

  // Get top 15 posts from ALL active feeds (not split by primary/secondary)
  const { data: allPosts } = await supabaseAdmin
    .from('rss_posts')
    .select('id, post_ratings(total_score)')
    .is('campaign_id', null)
    .gte('processed_at', lookbackTimestamp)
    .not('post_ratings', 'is', null)

  const top15 = allPosts
    ?.sort((a: any, b: any) => {
      const scoreA = a.post_ratings?.[0]?.total_score || 0
      const scoreB = b.post_ratings?.[0]?.total_score || 0
      return scoreB - scoreA
    })
    .slice(0, 15) || []

  // Assign to campaign
  if (top15.length > 0) {
    await supabaseAdmin
      .from('rss_posts')
      .update({ campaign_id: id })
      .in('id', top15.map(p => p.id))
  }

  console.log(`[Workflow Step 1/7] Assigned ${top15.length} posts to campaign`)

  // Deduplicate
  const dedupeResult = await processor.handleDuplicatesForCampaign(id)
  console.log(`[Workflow Step 1/7] Deduplication: ${dedupeResult.groups} groups, ${dedupeResult.duplicates} duplicates removed`)

  // Get count of remaining posts
  const { data: remainingPosts } = await supabaseAdmin
    .from('rss_posts')
    .select('id')
    .eq('campaign_id', id)
    .is('duplicate_of', null)

  console.log(`[Workflow Step 1/7] ${remainingPosts?.length || 0} unique posts remaining after deduplication`)
  console.log('[Workflow Step 1/7] ✓ Setup complete')

  return id
}

// Step 2: Generate First 5 Articles
async function generateArticlesBatch1(campaignId: string) {
  "use step"

  console.log('[Workflow Step 2/7] Generating 5 Local Scoop articles (batch 1)...')
  const processor = new RSSProcessor()

  // Get top 5 remaining posts after deduplication
  const { data: posts } = await supabaseAdmin
    .from('rss_posts')
    .select('id, post_ratings(total_score)')
    .eq('campaign_id', campaignId)
    .is('duplicate_of', null)
    .not('post_ratings', 'is', null)
    .order('id')  // Order by ID for consistent batch selection

  const sorted = posts?.sort((a: any, b: any) => {
    const scoreA = a.post_ratings?.[0]?.total_score || 0
    const scoreB = b.post_ratings?.[0]?.total_score || 0
    return scoreB - scoreA
  }) || []

  const batch1Posts = sorted.slice(0, 5)

  // Generate articles for batch 1
  await processor.generateArticlesForPosts(campaignId, batch1Posts.map(p => p.id))

  const { data: articles } = await supabaseAdmin
    .from('articles')
    .select('id, headline, content')
    .eq('campaign_id', campaignId)
    .not('headline', 'is', null)
    .not('content', 'is', null)

  console.log(`[Workflow Step 2/7] ✓ Generated ${articles?.length || 0} articles (batch 1)`)
}

// Step 3: Generate Second 5 Articles
async function generateArticlesBatch2(campaignId: string) {
  "use step"

  console.log('[Workflow Step 3/7] Generating 5 Local Scoop articles (batch 2)...')
  const processor = new RSSProcessor()

  // Get next 5 posts after batch 1
  const { data: posts } = await supabaseAdmin
    .from('rss_posts')
    .select('id, post_ratings(total_score)')
    .eq('campaign_id', campaignId)
    .is('duplicate_of', null)
    .not('post_ratings', 'is', null)
    .order('id')

  const sorted = posts?.sort((a: any, b: any) => {
    const scoreA = a.post_ratings?.[0]?.total_score || 0
    const scoreB = b.post_ratings?.[0]?.total_score || 0
    return scoreB - scoreA
  }) || []

  const batch2Posts = sorted.slice(5, 10)

  // Generate articles for batch 2
  await processor.generateArticlesForPosts(campaignId, batch2Posts.map(p => p.id))

  const { data: articles } = await supabaseAdmin
    .from('articles')
    .select('id, headline, content')
    .eq('campaign_id', campaignId)
    .not('headline', 'is', null)
    .not('content', 'is', null)

  console.log(`[Workflow Step 3/7] ✓ Total articles generated: ${articles?.length || 0}`)
}

// Step 4: Fact-Check All Articles
async function factCheckArticles(campaignId: string) {
  "use step"

  console.log('[Workflow Step 4/7] Fact-checking all Local Scoop articles...')
  const processor = new RSSProcessor()
  await processor.factCheckArticles(campaignId, 'all')

  const { data: articles } = await supabaseAdmin
    .from('articles')
    .select('id, fact_check_score')
    .eq('campaign_id', campaignId)
    .not('fact_check_score', 'is', null)

  const avgScore = (articles?.reduce((sum, a) => sum + (a.fact_check_score || 0), 0) || 0) / (articles?.length || 1)
  console.log(`[Workflow Step 4/7] ✓ Fact-checked ${articles?.length || 0} articles (avg: ${avgScore.toFixed(1)}/10)`)
}

// Step 5: Populate Events
async function populateEvents(campaignId: string) {
  "use step"

  console.log('[Workflow Step 5/7] Populating events section...')
  const processor = new RSSProcessor()

  // Auto-populate events (8 events per day, random selection)
  await processor.populateEventsForCampaignSmart(campaignId)

  const { data: events } = await supabaseAdmin
    .from('campaign_events')
    .select('id')
    .eq('campaign_id', campaignId)

  console.log(`[Workflow Step 5/7] ✓ Populated ${events?.length || 0} events`)
}

// Step 6: Generate Road Work
async function generateRoadWork(campaignId: string) {
  "use step"

  console.log('[Workflow Step 6/7] Generating road work section...')

  const { generateRoadWorkForCampaign } = await import('@/lib/road-work-manager')
  await generateRoadWorkForCampaign(campaignId)

  const { data: roadWork } = await supabaseAdmin
    .from('road_work_data')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .single()

  console.log(`[Workflow Step 6/7] ✓ Generated road work section`)
}

// Step 7: Finalize
async function finalizeCampaign(campaignId: string) {
  "use step"

  console.log('[Workflow Step 7/7] Finalizing campaign...')
  const processor = new RSSProcessor()

  // Auto-select top articles (all 10 Local Scoop articles)
  await processor.selectTopArticlesForCampaign(campaignId)

  // Generate subject line (using top article)
  await processor.generateSubjectLine(campaignId)

  const { data: campaign } = await supabaseAdmin
    .from('newsletter_campaigns')
    .select('subject_line')
    .eq('id', campaignId)
    .single()

  console.log(`Subject line: "${campaign?.subject_line?.substring(0, 50) || 'Not found'}..."`)

  // Set status to draft
  await supabaseAdmin
    .from('newsletter_campaigns')
    .update({ status: 'draft' })
    .eq('id', campaignId)

  console.log('[Workflow Step 7/7] ✓ Campaign finalized and set to draft')
}
```

### File: `src/app/api/cron/trigger-workflow/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { ScheduleChecker } from '@/lib/schedule-checker'
import { start } from 'workflow/api'
import { processRSSWorkflow } from '@/lib/workflows/process-rss-workflow'

/**
 * Workflow Trigger Cron
 * Runs every 5 minutes to check if it's time to execute the RSS workflow
 * for St. Cloud Scoop newsletter
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const searchParams = new URL(request.url).searchParams
    const secret = searchParams.get('secret')

    const isVercelCron = !secret && !searchParams.has('secret')
    const isManualTest = secret === process.env.CRON_SECRET

    if (!isVercelCron && !isManualTest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Workflow Trigger] Checking if it\'s time to run RSS processing')

    // Check if it's time to run RSS processing
    const shouldRun = await ScheduleChecker.shouldRunRSSProcessing()

    if (!shouldRun) {
      console.log('[Workflow Trigger] Not time yet for RSS processing')
      return NextResponse.json({
        success: true,
        message: 'Not scheduled at this time',
        skipped: true,
        timestamp: new Date().toISOString()
      })
    }

    console.log('[Workflow Trigger] Starting RSS workflow for St. Cloud Scoop')

    await start(processRSSWorkflow, [{
      trigger: 'cron'
    }])

    return NextResponse.json({
      success: true,
      message: 'RSS workflow started',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Workflow Trigger] Failed:', error)
    return NextResponse.json({
      error: 'Workflow trigger failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const maxDuration = 60
```

### Update `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest-rss",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/trigger-workflow",
      "schedule": "*/5 * * * *"
    }
  ],
  "functions": {
    "app/api/cron/ingest-rss/route.ts": {
      "maxDuration": 300
    },
    "app/api/cron/trigger-workflow/route.ts": {
      "maxDuration": 60
    },
    "app/api/workflows/process-rss/route.ts": {
      "maxDuration": 800
    }
  }
}
```

---

## Phase 8: Environment Variables

Add to `.env.local` and Vercel:

```bash
# Existing
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...

# New
PERPLEXITY_API_KEY=pplx-...
```

---

## Testing Checklist

### 1. Database Schema
- [ ] `ai_provider` column exists in `app_settings`
- [ ] All 9 prompts migrated to database
- [ ] Prompts have correct `ai_provider` values

### 2. AI Prompt System
- [ ] OpenAI prompts work correctly
- [ ] Perplexity prompts work correctly (if API key configured)
- [ ] `callAIWithPrompt()` handles both providers
- [ ] Placeholder replacement works
- [ ] JSON parsing works for structured prompts

### 3. Settings Page
- [ ] AI Prompts tab loads all 9 prompts
- [ ] Provider selector (OpenAI/Perplexity) works
- [ ] Format indicator shows correct status
- [ ] Edit/Save/Reset work correctly
- [ ] Test button works

### 4. RSS Ingestion
- [ ] Hourly cron runs successfully
- [ ] New posts appear in database
- [ ] No duplicate posts created
- [ ] All active feeds processed

### 5. Workflow
- [ ] 7-step workflow completes successfully
- [ ] Each step logs progress
- [ ] Campaign generates with 10 Local Scoop articles
- [ ] Events populate correctly (8 per day)
- [ ] Road work generates correctly (9 items)
- [ ] Subject line generates
- [ ] Campaign set to draft status

### 6. End-to-End
- [ ] Complete flow: Ingestion → Workflow → Campaign → Preview → Send
- [ ] Newsletter preview shows all sections
- [ ] Email sends correctly
- [ ] No errors in Vercel logs

---

## Deployment

### 1. Deploy Code

```bash
git add .
git commit -m "Implement OpenAI/Perplexity AI architecture with 7-step workflow"
git push origin main
```

### 2. Add Environment Variables in Vercel

Dashboard → Settings → Environment Variables:
- `PERPLEXITY_API_KEY=pplx-...`

### 3. Run Database Migration

In Supabase SQL Editor:
```sql
ALTER TABLE app_settings
ADD COLUMN ai_provider TEXT DEFAULT 'openai';
```

### 4. Run Prompt Migration

```bash
npx ts-node scripts/migrate-prompts.ts
```

### 5. Monitor First Runs

- Check RSS ingestion at top of next hour
- Check workflow trigger at next scheduled time (8:30 PM CT)
- Monitor Vercel logs for errors
- Verify campaign generates correctly

---

## Rollback Plan

If anything fails:

### 1. Disable New Crons

Update `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/rss-processing",
      "schedule": "30 20 * * *"
    }
  ]
}
```

### 2. Revert Database Changes

```sql
-- If needed, remove ai_provider column
ALTER TABLE app_settings
DROP COLUMN ai_provider;
```

### 3. Deploy Previous Version

```bash
git revert HEAD
git push origin main
```

---

## Support & Troubleshooting

### Issue: OpenAI API errors
- Check `OPENAI_API_KEY` is set correctly
- Verify API key has sufficient credits
- Check Vercel logs for detailed error messages

### Issue: Perplexity API errors
- Check `PERPLEXITY_API_KEY` is set correctly
- Verify Perplexity account is active
- Switch to OpenAI temporarily if needed

### Issue: Workflow timeout
- Check which step is timing out in Vercel logs
- Increase `maxDuration` for that specific step
- Check if API calls are hanging

### Issue: RSS ingestion not working
- Verify cron is running (check Vercel Cron logs)
- Test manually: `GET /api/cron/ingest-rss?secret=YOUR_SECRET`
- Check RSS feed URLs are accessible

### Issue: Campaign not generating
- Check workflow trigger logs
- Verify ScheduleChecker is working
- Test manually: `GET /api/cron/trigger-workflow?secret=YOUR_SECRET`

---

**END OF IMPLEMENTATION GUIDE**

Total estimated implementation time: **1-2 days** for experienced developer working full-time.
