-- Structured JSON Prompts Migration - Part 2
-- Purpose: Convert Event Summary, Image Analyzer, and Subject Line to structured format
-- Date: 2025-01-24
-- Benefits: Few-shot learning, consistent parameters, better AI performance

-- =============================================================================
-- PROMPT 1: EVENT SUMMARY (Structured Format with Few-Shot Learning)
-- =============================================================================
-- Benefits: Shows examples of transforming dry descriptions into engaging summaries
INSERT INTO app_settings (key, value, description)
VALUES (
  'ai_prompt_event_summary',
  jsonb_build_object(
    'model', 'gpt-4o',
    'temperature', 0.7,
    'top_p', 0.9,
    'presence_penalty', 0.1,
    'frequency_penalty', 0.1,
    'messages', jsonb_build_array(
      -- System prompt: Define the role and rules
      jsonb_build_object(
        'role', 'system',
        'content', 'You are writing engaging event summaries for a local St. Cloud, Minnesota newsletter.

REQUIREMENTS:
- Maximum 50 words
- Natural, engaging language
- Paraphrase completely - do not copy original wording
- Capture the essence and appeal of the event
- Write in third person
- Include key details that make it interesting
- Make readers want to attend

Your goal is to transform dry event descriptions into compelling, readable summaries that excite readers about attending.'
      ),

      -- Few-shot example 1: Transform dry description
      jsonb_build_object(
        'role', 'user',
        'content', 'Event Title: Library Book Club Meeting
Event Description: Monthly meeting of the St. Cloud Public Library Book Club. This month we will discuss "The Great Gatsby" by F. Scott Fitzgerald. All are welcome to attend. Meets in the community room on the second floor. Light refreshments will be served.
Event Venue: St. Cloud Public Library

Create a 50-word summary.'
      ),

      jsonb_build_object(
        'role', 'assistant',
        'content', '{"event_summary":"Join fellow book lovers for lively discussion of F. Scott Fitzgerald''s classic The Great Gatsby at the Library Book Club. Newcomers welcome to share insights over light refreshments in the cozy community room. Perfect for anyone seeking thoughtful conversation and literary connection.","word_count":44}'
      ),

      -- Few-shot example 2: Transform event with technical details
      jsonb_build_object(
        'role', 'user',
        'content', 'Event Title: Youth Hockey Skills Camp
Event Description: Three-day hockey skills development camp for ages 8-14. Players will work on skating, puck handling, shooting, and game strategy. Coached by former college players. Registration required. Cost is $150 per participant. Bring full hockey equipment.
Event Venue: Municipal Ice Arena

Create a 50-word summary.'
      ),

      jsonb_build_object(
        'role', 'assistant',
        'content', '{"event_summary":"Young hockey players can sharpen their skills during this intensive three-day camp led by experienced college-level coaches. Participants ages 8-14 will master skating techniques, puck handling, shooting accuracy, and strategic gameplay. Registration required; full equipment needed.","word_count":38}'
      ),

      -- User prompt template with placeholders
      jsonb_build_object(
        'role', 'user',
        'content', 'Event Title: {{title}}
Event Description: {{description}}
Event Venue: {{venue}}

Create a 50-word summary that is engaging and makes people want to attend. Respond with valid JSON:
{
  "event_summary": "<concise 50-word summary>",
  "word_count": <exact word count>
}'
      )
    )
  ),
  'Events - Event Summarizer: Creates natural 50-word summaries for featured events with few-shot examples'
)
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- =============================================================================
-- PROMPT 2: IMAGE ANALYZER (Structured Format with Examples)
-- =============================================================================
-- Benefits: Shows examples of proper tagging, OCR extraction, JSON structure
INSERT INTO app_settings (key, value, description)
VALUES (
  'ai_prompt_image_analyzer',
  jsonb_build_object(
    'model', 'gpt-4o',
    'temperature', 0.5,
    'top_p', 0.95,
    'presence_penalty', 0,
    'frequency_penalty', 0,
    'messages', jsonb_build_array(
      -- System prompt: Define analysis requirements
      jsonb_build_object(
        'role', 'system',
        'content', 'You analyze images for a St. Cloud, Minnesota local newsletter. Focus on identifying elements relevant to community news, events, education, public safety, healthcare, sports, business development, seasonal activities, and local landmarks.

REQUIRED JSON OUTPUT FORMAT:
{
  "caption": "Natural descriptive sentence about the image",
  "alt_text": "10-14 words, descriptive, no quotes",
  "tags_scored": [
    {"type":"scene","name":"warehouse","conf":0.95},
    {"type":"object","name":"golf_cart","conf":0.98}
  ],
  "top_tags": ["scene_warehouse","object_golf_cart","color_blue"],
  "ocr_text": "extracted text in lowercase",
  "text_density": 0.15,
  "ocr_entities": [
    {"type":"ORG","name":"st cloud police department","conf":0.93}
  ],
  "signage_conf": 0.78,
  "age_groups": [
    {"age_group":"adult","count":2,"conf":0.92}
  ]
}

TAG TYPES: location, venue, scene, event_type, sport, season, object, safety, mood, activity
TAG NAMES: concrete nouns, lowercase with underscores
CONFIDENCE: 0.9+ obvious, 0.5-0.8 likely, <0.5 uncertain

ST. CLOUD PRIORITY TAGS:
- Locations: apollo_high_school, scsu_campus, downtown_st_cloud, lake_george
- Events: ribbon_cutting, open_house, hockey_game, festival
- Seasonal: autumn_foliage, snow, flowers, outdoor_events
- Public Safety: fire_truck, police_cruiser, emergency_vehicle
- Sports: husky_hockey, youth_hockey, volleyball, basketball

OCR: Extract ALL text, normalize spacing, identify entities (ORG, PERSON, LOC, DATE)
SIGNAGE: 0.8+ clear business signs, 0.5-0.8 likely signage, <0.2 not signage
AGE GROUPS: Only if people visible - preschool, elementary, high_school, adult, older_adult'
      ),

      -- Few-shot example: Demonstrate proper structure
      jsonb_build_object(
        'role', 'user',
        'content', 'Analyze this image: [Image of a fire truck at a fire station with "St. Cloud Fire Station 3" signage visible, 2 firefighters standing in front, autumn leaves visible]'
      ),

      jsonb_build_object(
        'role', 'assistant',
        'content', '{"caption":"St. Cloud Fire Station 3 firefighters stand beside their emergency vehicle on an autumn day.","alt_text":"Two firefighters posing in front of red fire truck at station","tags_scored":[{"type":"venue","name":"fire_station","conf":0.98},{"type":"object","name":"fire_truck","conf":0.99},{"type":"activity","name":"emergency_services","conf":0.95},{"type":"season","name":"autumn","conf":0.88},{"type":"object","name":"emergency_vehicle","conf":0.97},{"type":"safety","name":"has_text","conf":0.92}],"top_tags":["venue_fire_station","object_fire_truck","activity_emergency_services","season_autumn","object_emergency_vehicle"],"ocr_text":"st cloud fire station 3","text_density":0.08,"ocr_entities":[{"type":"ORG","name":"st cloud fire station 3","conf":0.96}],"signage_conf":0.92,"age_groups":[{"age_group":"adult","count":2,"conf":0.95}]}'
      ),

      -- User prompt for actual analysis
      jsonb_build_object(
        'role', 'user',
        'content', 'Analyze this image for the St. Cloud newsletter. Provide comprehensive tagging, OCR extraction, and metadata following the JSON format shown in examples.'
      )
    )
  ),
  'Images - Image Analyzer: Analyzes uploaded images with AI tagging, OCR, and metadata extraction using structured format with examples'
)
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- =============================================================================
-- PROMPT 3: SUBJECT LINE GENERATOR (Structured Format with Few-Shot Learning)
-- =============================================================================
-- Benefits: Shows examples of good subject lines, demonstrates style requirements
INSERT INTO app_settings (key, value, description)
VALUES (
  'ai_prompt_subject_line',
  jsonb_build_object(
    'model', 'gpt-4o',
    'temperature', 0.8,
    'top_p', 0.95,
    'presence_penalty', 0.3,
    'frequency_penalty', 0.3,
    'messages', jsonb_build_array(
      -- System prompt: Define subject line rules
      jsonb_build_object(
        'role', 'system',
        'content', 'You craft front-page newspaper headlines for a next-day St. Cloud, Minnesota newsletter based on the most interesting article.

HARD RULES:
- ≤ 40 characters (every space and punctuation counts)
- Title Case; avoid ALL-CAPS words
- Omit the year
- No em dashes (—)
- No colons (:) or other punctuation that splits the headline
- Return ONLY the headline text (no emoji, that is added automatically)

IMPACT CHECKLIST:
- Lead with a power verb
- Local pride - include place name if it adds punch
- Trim fluff - every word earns its spot
- Character audit - recount after final trim

STYLE: Write as if the event just happened, not as historical reflection. Use urgent, active voice suitable for breaking news. Avoid words like "Legacy," "Honors," "Remembers," "Celebrates History."

CREATIVITY: Each generation should produce unique headline variations. Explore different angles, power verbs, emotional hooks. Consider multiple ways to frame the same story - focus on different aspects, beneficiaries, or impacts. Never repeat previous generations.'
      ),

      -- Few-shot example 1: Good subject line
      jsonb_build_object(
        'role', 'user',
        'content', 'Articles in newsletter:
1. New Ice Rink Opens at Lake George
   St. Cloud Parks and Recreation Department unveiled a brand new outdoor ice skating rink at Lake George this week...'
      ),

      jsonb_build_object(
        'role', 'assistant',
        'content', 'Lake George Debuts Free Ice Rink'
      ),

      -- Few-shot example 2: Another good subject line
      jsonb_build_object(
        'role', 'user',
        'content', 'Articles in newsletter:
1. Sartell Bridge Construction Begins Monday
   The Minnesota Department of Transportation will close the Sartell Bridge for major repairs starting Monday morning...'
      ),

      jsonb_build_object(
        'role', 'assistant',
        'content', 'Sartell Bridge Shuts for Six Weeks'
      ),

      -- Few-shot example 3: Variation with different angle
      jsonb_build_object(
        'role', 'user',
        'content', 'Articles in newsletter:
1. St. Cloud School District Launches STEM Program
   District 742 announced a comprehensive STEM education program providing hands-on experience in science, technology...'
      ),

      jsonb_build_object(
        'role', 'assistant',
        'content', 'District 742 Unveils STEM Revolution'
      ),

      -- User prompt template with placeholders
      jsonb_build_object(
        'role', 'user',
        'content', 'Articles in this newsletter:
{{articles}}

Create a compelling front-page headline based on the most interesting article. Remember: ≤40 characters, Title Case, no colons or em dashes. Return ONLY the headline text.'
      )
    )
  ),
  'Newsletter - Subject Line Generator: Creates engaging subject lines based on top article (max 40 characters) with few-shot examples and high creativity'
)
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- =============================================================================
-- VERIFICATION: Display all updated prompts
-- =============================================================================
SELECT
  key,
  description,
  CASE
    WHEN jsonb_typeof(value) = 'object' AND value ? 'messages' THEN 'Structured JSON'
    WHEN jsonb_typeof(value) = 'string' THEN 'Plain Text'
    ELSE 'Unknown Format'
  END as format_type,
  CASE
    WHEN jsonb_typeof(value) = 'object' AND value ? 'messages'
    THEN jsonb_array_length(value->'messages')
    ELSE NULL
  END as message_count,
  value->>'model' as model,
  value->>'temperature' as temperature,
  LENGTH(value::text) as total_length,
  updated_at
FROM app_settings
WHERE key IN (
  'ai_prompt_event_summary',
  'ai_prompt_image_analyzer',
  'ai_prompt_subject_line'
)
ORDER BY key;

-- =============================================================================
-- FINAL VERIFICATION: Show ALL AI prompts
-- =============================================================================
SELECT
  key,
  CASE
    WHEN jsonb_typeof(value) = 'object' AND value ? 'messages' THEN '✓ Structured JSON'
    WHEN jsonb_typeof(value) = 'string' THEN '✗ Plain Text'
    ELSE '? Unknown'
  END as format_status,
  CASE
    WHEN jsonb_typeof(value) = 'object' AND value ? 'messages'
    THEN jsonb_array_length(value->'messages')
    ELSE NULL
  END as messages,
  value->>'model' as model,
  value->>'temperature' as temp
FROM app_settings
WHERE key LIKE 'ai_prompt_%'
ORDER BY
  CASE WHEN jsonb_typeof(value) = 'object' AND value ? 'messages' THEN 0 ELSE 1 END,
  key;
