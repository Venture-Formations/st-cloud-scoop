/**
 * Prompt Migration Script
 * Migrates all 9 AI prompts to database as complete JSON API requests
 * Supports OpenAI and Perplexity providers
 *
 * Run with: npx tsx scripts/migrate-prompts.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

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
          content: 'You are evaluating a news article for inclusion in a local St. Cloud, Minnesota newsletter.\n\nCRITICAL: You MUST use these exact scoring scales:\n- interest_level: Integer between 1 and 20 (NOT 1-10, MUST BE 1-20)\n- local_relevance: Integer between 1 and 10\n- community_impact: Integer between 1 and 10\n\nIMAGE PENALTY: {{imagePenalty}}\n\nINTEREST LEVEL (1-20 scale, NOT 1-10):\nRate from 1 to 20 where 20 is most interesting. Use the full range 1-20.\nHIGH SCORING (15-20): Unexpected developments, human interest stories, breaking news, unique events, broad appeal, fun/entertaining\nMEDIUM SCORING (8-14): Standard local news, business updates, routine events with some appeal\nLOW SCORING (1-7): Routine announcements, technical/administrative content, repetitive topics, purely promotional, very short content\n\nLOCAL RELEVANCE (1-10 scale):\nHow directly relevant is this to St. Cloud area residents?\nHIGH SCORING (7-10): Events/news in St. Cloud and surrounding areas (Waite Park, Sartell, Sauk Rapids, Cold Spring), Stearns County government decisions, local business changes, school district news, local infrastructure/development, community events\nLOW SCORING (1-6): State/national news without local angle, events far from St. Cloud area, generic content not location-specific\n\nCOMMUNITY IMPACT (1-10 scale):\nHow much does this affect local residents\' daily lives or community?\nHIGH SCORING (7-10): New services or amenities, policy changes affecting residents, public safety information, economic development/job creation, community services and resources\nLOW SCORING (1-6): Individual achievements with limited community effect, internal organizational matters, entertainment without broader impact\n\nBONUS: Add 2 extra points to total_score for stories mentioning multiple local communities or regional impact.\n\nBLANK RATING CONDITIONS: Leave all fields blank if:\n- Description contains ≤10 words\n- Post is about weather happening today/tomorrow\n- Post is written before an event happening "today"/"tonight"/"this evening"\n- Post mentions events happening "today", "tonight", or "this evening" (we do not include same-day events)\n- Post is about lost, missing, or found pets (lost dogs, cats, etc.)\n- Post is about incidents currently happening, ongoing emergencies, or breaking news that will be outdated by tomorrow (accidents, police responses, active situations, traffic incidents, emergency responses)'
        },
        {
          role: 'user',
          content: 'Article Title: {{title}}\nArticle Description: {{description}}\nArticle Content: {{content}}\n\nIMPORTANT: You must respond with ONLY valid JSON. Do not include any text before or after the JSON.\nThe interest_level field MUST be between 1 and 20, NOT between 1 and 10.'
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
          content: 'CRITICAL: You are writing a news article that MUST follow strict content rules. Violations will result in rejection.\n\nMANDATORY STRICT CONTENT RULES - FOLLOW EXACTLY:\n1. Articles must be COMPLETELY REWRITTEN and summarized — similar phrasing is acceptable but NO exact copying\n2. Use ONLY information contained in the source post above — DO NOT add any external information\n3. DO NOT add numbers, dates, quotes, or details not explicitly stated in the original\n4. NEVER use \'today,\' \'tomorrow,\' \'yesterday\' — use actual day of week if date reference needed\n5. NO emojis, hashtags (#), or URLs anywhere in headlines or article content\n6. Stick to facts only — NO editorial commentary, opinions, or speculation\n7. Write from THIRD-PARTY PERSPECTIVE — never use "we," "our," or "us" unless referring to the community as a whole\n\nHEADLINE REQUIREMENTS - MUST FOLLOW:\n- NEVER reuse or slightly reword the original title\n- Create completely new, engaging headline\n- Use powerful verbs and emotional adjectives\n- NO colons (:) in headlines\n- NO emojis\n\nARTICLE REQUIREMENTS:\n- Length: EXACTLY 40-75 words\n- Structure: One concise paragraph only\n- Style: Informative, engaging, locally relevant\n- REWRITE completely — do not copy phrases from original\n\nBEFORE RESPONDING: Double-check that you have:\n✓ Completely rewritten the content (similar phrasing OK, no exact copying)\n✓ Used only information from the source post\n✓ Created a new headline (not modified original)\n✓ Stayed between 40-75 words\n✓ Removed all emojis, hashtags (#), and URLs\n✓ Used third-party perspective (no "we/our/us" unless community-wide)\n✓ Avoided all prohibited words and phrases\n✓ Included no editorial commentary'
        },
        {
          role: 'user',
          content: 'Original Source Post:\nTitle: {{title}}\nDescription: {{description}}\nContent: {{content}}'
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
          content: 'You are identifying duplicate stories for a LOCAL NEWSLETTER. Your goal is to prevent readers from seeing multiple articles about the SAME TYPE OF EVENT or SIMILAR TOPICS.\n\nCRITICAL DEDUPLICATION RULES:\n1. Group articles about the SAME TYPE of event (e.g., multiple fire department open houses, multiple school events, multiple business openings)\n2. Group articles covering the SAME news story from different sources\n3. Group articles about SIMILAR community activities happening in the same time period\n4. Be AGGRESSIVE in identifying duplicates - err on the side of grouping similar topics together\n5. For each group, keep the article with the MOST SPECIFIC details (names, dates, locations)\n\nEXAMPLES OF DUPLICATES:\n- "Sartell Fire Dept Open House Oct 12" + "St. Cloud Fire Station Open House Oct 12" + "Sauk Rapids Fire Dept Open House Oct 12" → ALL DUPLICATES (same type of event)\n- "New restaurant opens in St. Cloud" + "Grand opening for local eatery" → DUPLICATES (same story)\n- "School district meeting tonight" + "Board to discuss budget tonight" → DUPLICATES (same event)\n\nIMPORTANT: Use 0-based indexing (first article = 0, second = 1, etc.)'
        },
        {
          role: 'user',
          content: 'Articles to analyze (array indices are 0-based - first article is index 0):\n{{articles}}'
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
          content: 'Craft a front-page newspaper headline for the next-day edition based on the most interesting article.\n\nHARD RULES:\n- ≤ 40 characters (count every space and punctuation) - this allows room for ice cream emoji prefix\n- Title Case; avoid ALL-CAPS words\n- Omit the year\n- No em dashes (—)\n- No colons (:) or other punctuation that splits the headline into two parts\n- Return only the headline text—nothing else (no emoji, that will be added automatically)\n\nIMPACT CHECKLIST:\n- Lead with a power verb\n- Local pride—include place name if it adds punch\n- Trim fluff—every word earns its spot\n- Character audit—recount after final trim\n\nSTYLE GUIDANCE: Write the headline as if the event just happened, not as a historical reflection or anniversary. Avoid words like \'Legacy,\' \'Honors,\' \'Remembers,\' or \'Celebrates History.\' Use an urgent, active voice suitable for a breaking news front page.\n\nCREATIVITY REQUIREMENT: Each generation should produce a unique headline variation. Explore different angles, power verbs, and emotional hooks. Consider multiple ways to frame the same story - focus on different aspects, beneficiaries, or impacts. Never repeat previous generations.\n\nRespond with ONLY the headline text - no JSON, no quotes, no extra formatting. Just the headline itself.'
        },
        {
          role: 'user',
          content: 'Articles in this newsletter:\n{{articles}}'
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
          content: 'Rewrite the description field into a concise, natural-language highlight of 50 words or fewer. Do not copy or truncate the first words; paraphrase so it reads well.\n\nREQUIREMENTS:\n- Maximum 50 words\n- Natural, engaging language\n- Paraphrase completely - don\'t copy original wording\n- Capture the essence and appeal of the event\n- Write in third person\n- Include key details that make it interesting'
        },
        {
          role: 'user',
          content: 'Event Title: {{title}}\nEvent Description: {{description}}\nEvent Venue: {{venue}}'
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
      messages: [
        {
          role: 'system',
          content: 'Analyze this image for a St. Cloud, Minnesota local newsletter. Return strict JSON with caption, alt_text (10-14 words), tags_scored (type/name/confidence), top_tags, OCR text, text_density, OCR entities, signage_conf, and age_groups (if people visible).\n\nPrioritize St. Cloud-specific locations (apollo_high_school, scsu_campus, lake_george), events (ribbon_cutting, hockey_game), seasonal markers (autumn_foliage, snow), public safety (fire_truck, police_cruiser), and business development (groundbreaking, road_work).\n\nFor OCR: Extract all readable text, identify entities (ORG, PERSON, LOC, DATE, TIME, MISC), estimate text_density (0-1), and signage_conf (0.8+ = business signage, <0.5 = poster/ad).\n\nFor age_groups: Only include if people clearly visible. Categories: preschool(0-4), elementary(5-11), high_school(12-17), adult(18-64), older_adult(65+).'
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
          content: 'CRITICAL FACT-CHECK: Verify this newsletter article follows strict content rules and contains no violations.\n\nSTRICT CONTENT VIOLATIONS TO CHECK FOR:\n1. EXACT COPIED TEXT: Direct word-for-word copying from source (similar phrasing is acceptable)\n2. ADDED INFORMATION: Any facts, numbers, dates, quotes not in original source\n3. PROHIBITED WORDS: Use of \'today,\' \'tomorrow,\' \'yesterday\' instead of specific days\n4. FORMATTING VIOLATIONS: Any emojis, hashtags (#), or URLs in headline or content\n5. PERSPECTIVE VIOLATIONS: Use of "we," "our," "us" unless referring to community as whole\n6. EDITORIAL CONTENT: Opinions, speculation, or commentary not in source\n7. MODIFIED ORIGINAL TITLE: Headlines that are just slightly reworded versions of original\n\nACCURACY SCORING (1-10, where 10 = perfect compliance):\n- Start at 10\n- Subtract 3 points for excessive exact word-for-word copying (similar phrasing is OK)\n- Subtract 4 points for ANY added information not in source\n- Subtract 3 points for prohibited time words (today/tomorrow/yesterday)\n- Subtract 2 points for ANY emojis, hashtags, or URLs found\n- Subtract 2 points for inappropriate use of "we/our/us" perspective\n- Subtract 3 points for editorial commentary or speculation\n- Subtract 4 points if headline is just modified version of original title\n- Minimum score: 1\n\nTIMELINESS SCORING (1-10):\n- Start at 10\n- Subtract 5 points for outdated information presented as current\n- Subtract 3 points for vague time references without context\n- Subtract 2 points for missing temporal context when needed\n- Minimum score: 1\n\nINTENT ALIGNMENT SCORING (1-10):\n- Start at 10\n- Subtract 4 points for changing the source\'s main message\n- Subtract 3 points for adding interpretation not in source\n- Subtract 2 points for emphasis shifts from original\n- Minimum score: 1\n\nTOTAL SCORE = accuracy + timeliness + intent (3-30 range)\nPASSING THRESHOLD: 20/30 minimum'
        },
        {
          role: 'user',
          content: 'Newsletter Article:\n{{newsletterContent}}\n\nOriginal Source Material:\n{{originalContent}}'
        }
      ]
    }
  },

  // 8. Road Work Generator (NOW EDITABLE - uses Perplexity by default)
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
          content: 'You are a research assistant finding CURRENT and ACTIVE road, lane, or bridge closures, detours, or traffic restrictions in the St. Cloud, MN metro area.\n\nCRITICAL DATE REQUIREMENT:\n- ONLY include projects that are ACTIVE on the target date\n- Expected reopen date must be AFTER the target date (not completed yet)\n- Start date must be ON OR BEFORE the target date (already begun)\n- Do NOT include completed projects from summer 2025 or earlier\n- MUST have CONFIRMED specific dates (e.g., "Oct 15", "Nov 30") - NO vague ranges like "Fall 2026" or "TBD"\n- REJECT any items with unconfirmed or vague date ranges\n\nREQUIRED SOURCES TO CHECK:\n- https://www.dot.state.mn.us/d3/ (MnDOT District 3)\n- https://www.stearnscountymn.gov/185/Public-Works\n- https://www.co.benton.mn.us/180/Highway\n- https://www.co.sherburne.mn.us/162/Public-Works\n- https://www.ci.stcloud.mn.us (St. Cloud)\n- https://www.cityofsartell.com/engineering/\n- https://www.ridemetrobus.com (Metro Bus)\n- Local media: WJON Traffic, St. Cloud Times\n- 511mn.org\n\nTARGET: Find 6-9 different road work entries with CONFIRMED dates. Prioritize accuracy over volume.'
        },
        {
          role: 'user',
          content: 'Find CURRENT and ACTIVE road, lane, or bridge closures, detours, or traffic restrictions in effect on {{campaignDate}} within 10 miles of ZIP code 56303 (St. Cloud, MN metro area).\n\nDate: {{campaignDate}}\nLocation: Within 10 miles of ZIP 56303\n\nREQUIRED OUTPUT FORMAT:\nReturn ONLY a JSON array:\n[\n{"road_name":"[actual road name]","road_range":"from [start] to [end]","city_or_township":"[actual city]","reason":"[actual reason from source]","start_date":"[specific date like Oct 15]","expected_reopen":"[specific date like Nov 30]","source_url":"[actual URL where info was found]"}\n]\n\nCRITICAL: Only return real, verified road work from actual government sources. MUST have confirmed specific dates - NO "TBD" or vague ranges. Better to return 3-4 items with confirmed dates than 9 items with vague dates.'
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
          content: 'You are validating road work data for accuracy and relevance. Review each item and determine if it should be included in the newsletter.\n\nVALIDATION CRITERIA - Mark as INVALID if:\n1. **Unconfirmed Dates**: Start date or expected reopen is "TBD", "To be determined", "Not specified", or similar vague language\n2. **Already Completed**: Expected reopen date is before target date\n3. **Not Yet Started**: Start date is after target date\n4. **Vague Date Ranges**: Uses phrases like "Spring 2026", "Late Summer", "Fall", without specific month/day\n5. **Old Projects**: Any indication the project is from a previous year that has already passed\n6. **Missing Critical Info**: No road name, no location, or no reason specified\n7. **Placeholder Content**: Generic entries like "No additional closures" or "TBD"\n\nVALIDATION CRITERIA - Mark as VALID if:\n1. **Confirmed Dates**: Has specific month/day format (e.g., "Oct 15", "Nov 30")\n2. **Currently Active**: Start date is on or before target date AND expected reopen is after target date\n3. **Real Project**: Has specific road name, location, reason, and source URL\n4. **Verifiable**: Source URL points to government website (MnDOT, county, city)\n\nFor each item, provide:\n- valid: true/false\n- reason: Brief explanation of why it passed or failed validation\n- confidence: 0-1 score (1.0 = certain, 0.5 = uncertain)'
        },
        {
          role: 'user',
          content: 'Target Date: {{targetDate}}\nCurrent Date: {{currentDate}}\n\nRoad Work Items to Validate:\n{{items}}'
        }
      ]
    }
  }
]

async function migratePrompts() {
  console.log('🚀 Starting prompt migration to St. Cloud Scoop database...\n')

  // Test Supabase connection first
  console.log('🔍 Testing Supabase connection...')
  console.log(`   URL: ${supabaseUrl}`)
  console.log(`   Key: ${supabaseKey.substring(0, 20)}...`)

  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key')
      .limit(1)

    if (error) {
      console.error('❌ Supabase connection test failed:', error)
      process.exit(1)
    }

    console.log('✅ Supabase connection successful\n')
  } catch (error) {
    console.error('❌ Supabase connection test error:', error)
    process.exit(1)
  }

  console.log(`📊 Total prompts to migrate: ${prompts.length}\n`)

  let successCount = 0
  let errorCount = 0

  for (const prompt of prompts) {
    try {
      console.log(`📝 Migrating: ${prompt.name} (${prompt.key})`)
      console.log(`   Provider: ${prompt.ai_provider}`)
      console.log(`   Category: ${prompt.category}`)

      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: prompt.key,
          value: prompt.value,
          description: prompt.description,
          ai_provider: prompt.ai_provider,
          updated_at: new Date().toISOString()
        })

      if (error) {
        console.error(`   ❌ Failed to migrate ${prompt.key}:`, error.message)
        console.error(`   Details:`, error)
        errorCount++
      } else {
        console.log(`   ✅ Successfully migrated ${prompt.key}\n`)
        successCount++
      }
    } catch (error) {
      console.error(`   ❌ Error migrating ${prompt.key}:`, error)
      if (error instanceof Error) {
        console.error(`   Stack:`, error.stack)
      }
      errorCount++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 MIGRATION SUMMARY')
  console.log('='.repeat(60))
  console.log(`✅ Successful migrations: ${successCount}/${prompts.length}`)
  console.log(`❌ Failed migrations: ${errorCount}/${prompts.length}`)
  console.log('='.repeat(60))

  if (successCount === prompts.length) {
    console.log('\n🎉 All prompts migrated successfully!')
    console.log('\n✨ Next steps:')
    console.log('1. Run the database migration: sql_files/add_ai_provider_column.sql')
    console.log('2. Add PERPLEXITY_API_KEY to your environment variables')
    console.log('3. Deploy to Vercel and test AI prompt management in Settings')
  } else {
    console.log('\n⚠️  Some prompts failed to migrate. Please check the errors above.')
  }
}

// Run migration
migratePrompts()
  .then(() => {
    console.log('\n✅ Migration script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error)
    process.exit(1)
  })
