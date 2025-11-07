-- ================================================================
-- MULTI-CRITERIA SCORING: DEFAULT AI PROMPTS (JSONB Compatible)
-- ================================================================
-- Version: 3.0
-- Date: 2025-01-07
-- Description: Default AI prompts for 3 scoring criteria tailored
--              to St. Cloud Scoop newsletter. Uses dollar quoting
--              for proper JSONB handling.
-- ================================================================

-- NOTE: Run this AFTER running multi_criteria_scoring_migration.sql

-- ============================================================
-- CRITERION 1: INTEREST LEVEL
-- ============================================================
INSERT INTO app_settings (key, value, description, created_at, updated_at)
VALUES (
  'ai_prompt_criteria_1',
  to_jsonb($$You are evaluating a news article for INTEREST LEVEL to St. Cloud, Minnesota newsletter readers.

Your task is to score this article on a scale of 0-10 based on how interesting and engaging it is.

SCORING CRITERIA (0-10 scale):

HIGH SCORES (8-10):
- Unexpected developments or surprising insights
- Human interest stories with broad appeal
- Breaking news that will impact daily life
- Unique events or innovative solutions
- Fun, entertaining, or inspiring content
- Content that sparks conversation or curiosity
- Visual content (photos, videos) that enhances story
- Local personalities or community figures making news

MEDIUM SCORES (4-7):
- Standard local news and updates
- Business openings or changes
- Educational content with moderate appeal
- Community events and announcements
- Useful information for residents
- Local sports and achievements
- Typical city council or school board news

LOW SCORES (0-3):
- Dry technical or administrative content
- Routine announcements with minimal appeal
- Purely promotional material
- Repetitive topics recently covered
- Very niche content with limited broader interest
- Posts with ≤10 words in description
- Weather for today/tomorrow (not newsworthy)

IMAGE PENALTY: If the article has NO image, reduce the score by 2 points.

Article Title: {{title}}
Article Description: {{description}}
Article Content: {{content}}
Has Image: {{hasImage}}

IMPORTANT: You must respond with ONLY valid JSON. Do not include any text before or after the JSON.

Response format:
{
  "score": <integer 0-10>,
  "reason": "<detailed explanation of your scoring, referencing specific elements that drove the score>"
}$$::text),
  'AI prompt for evaluating article interest level (Criterion 1)',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================
-- CRITERION 2: LOCAL RELEVANCE
-- ============================================================
INSERT INTO app_settings (key, value, description, created_at, updated_at)
VALUES (
  'ai_prompt_criteria_2',
  to_jsonb($$You are evaluating a news article for LOCAL RELEVANCE to St. Cloud, Minnesota area residents.

Your task is to score this article on a scale of 0-10 based on how directly relevant it is to the St. Cloud community.

SCORING CRITERIA (0-10 scale):

HIGH SCORES (8-10):
- Events or news happening IN St. Cloud or immediately surrounding areas:
  * St. Cloud proper
  * Waite Park
  * Sartell
  * Sauk Rapids
  * Cold Spring
  * St. Joseph
- Stearns County government decisions
- St. Cloud school district (ISD 742) news
- Local business changes in St. Cloud area
- Infrastructure and development projects in St. Cloud
- Community events specifically in St. Cloud
- Local people making news (residents, business owners, officials)
- St. Cloud university news (SCSU, St. Cloud Technical)
- Local public safety (police, fire, emergency services)

MEDIUM SCORES (4-7):
- Central Minnesota regional news with St. Cloud implications
- Statewide news affecting St. Cloud residents
- Nearby communities (within 20 miles)
- State government decisions with local impact
- Minnesota businesses expanding to St. Cloud
- Regional economic trends
- Minnesota sports with local following

LOW SCORES (0-3):
- National news without local angle
- Events far from St. Cloud area (more than 30 miles)
- Generic content not location-specific
- International news
- Out-of-state content without St. Cloud connection
- Generic "Minnesota" content not specific to Central MN

IMPORTANT LOCATION IDENTIFIERS:
If the article mentions "St. Cloud", "Stearns County", "ZIP 56303", "Central Minnesota", or specific St. Cloud landmarks/streets, it likely scores high for local relevance.

Article Title: {{title}}
Article Description: {{description}}
Article Content: {{content}}

IMPORTANT: You must respond with ONLY valid JSON. Do not include any text before or after the JSON.

Response format:
{
  "score": <integer 0-10>,
  "reason": "<detailed explanation of your scoring, specifically citing location mentions and local connections>"
}$$::text),
  'AI prompt for evaluating article local relevance (Criterion 2)',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================
-- CRITERION 3: COMMUNITY IMPACT
-- ============================================================
INSERT INTO app_settings (key, value, description, created_at, updated_at)
VALUES (
  'ai_prompt_criteria_3',
  to_jsonb($$You are evaluating a news article for COMMUNITY IMPACT on St. Cloud, Minnesota residents.

Your task is to score this article on a scale of 0-10 based on how much it affects local residents' daily lives or the broader community.

SCORING CRITERIA (0-10 scale):

HIGH SCORES (8-10):
- Public safety information (road closures, emergencies, warnings)
- New services or amenities opening for residents
- Policy changes affecting residents (taxes, regulations, fees)
- Economic development creating jobs
- Major infrastructure projects (roads, utilities, facilities)
- School district decisions affecting students/families
- Community services and resources (libraries, parks, programs)
- Health and wellness resources
- Environmental issues affecting residents
- Housing and development affecting neighborhoods

MEDIUM SCORES (4-7):
- Local events and celebrations
- Community achievements and milestones
- Business changes (openings, closings, relocations)
- Educational programs and opportunities
- Cultural events and activities
- Local organizations and nonprofits news
- City planning and future projects
- Historical preservation efforts

LOW SCORES (0-3):
- Individual achievements with limited community effect
- Internal organizational matters
- Entertainment without broader impact
- Routine government proceedings without actionable decisions
- Purely informational content with no call to action
- Awards and recognition with minimal community benefit
- Generic news that doesn't affect daily life

PERSPECTIVE: Ask yourself "Will this news change what St. Cloud residents do, where they go, or how they live their daily lives?"

Article Title: {{title}}
Article Description: {{description}}
Article Content: {{content}}

IMPORTANT: You must respond with ONLY valid JSON. Do not include any text before or after the JSON.

Response format:
{
  "score": <integer 0-10>,
  "reason": "<detailed explanation of your scoring, focusing on tangible impacts to residents' daily lives>"
}$$::text),
  'AI prompt for evaluating article community impact (Criterion 3)',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ================================================================
-- VERIFICATION
-- ================================================================

-- Verify prompts were added
SELECT
  key,
  LEFT(value::text, 100) || '...' as prompt_preview,
  description
FROM app_settings
WHERE key LIKE 'ai_prompt_criteria_%'
ORDER BY key;

-- ================================================================
-- DONE
-- ================================================================
SELECT 'Multi-criteria default prompts installed!' as status;
