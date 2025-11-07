-- ================================================================
-- MULTI-CRITERIA SCORING SYSTEM MIGRATION
-- ================================================================
-- Version: 1.0
-- Date: 2025-01-07
-- Description: Migrates from combined criteria (interest_level,
--              local_relevance, community_impact) to separated
--              multi-criteria scoring with configurable weights
-- ================================================================

-- ================================================================
-- PART 1: ADD NEW COLUMNS TO post_ratings TABLE
-- ================================================================

ALTER TABLE post_ratings
  -- Criterion 1: Interest Level
  ADD COLUMN IF NOT EXISTS criteria_1_score INTEGER CHECK (criteria_1_score BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS criteria_1_reason TEXT,
  ADD COLUMN IF NOT EXISTS criteria_1_weight DECIMAL(10,2) DEFAULT 1.0,

  -- Criterion 2: Local Relevance
  ADD COLUMN IF NOT EXISTS criteria_2_score INTEGER CHECK (criteria_2_score BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS criteria_2_reason TEXT,
  ADD COLUMN IF NOT EXISTS criteria_2_weight DECIMAL(10,2) DEFAULT 1.5,

  -- Criterion 3: Community Impact
  ADD COLUMN IF NOT EXISTS criteria_3_score INTEGER CHECK (criteria_3_score BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS criteria_3_reason TEXT,
  ADD COLUMN IF NOT EXISTS criteria_3_weight DECIMAL(10,2) DEFAULT 1.0,

  -- Criteria 4 & 5 (Reserved for future expansion)
  ADD COLUMN IF NOT EXISTS criteria_4_score INTEGER CHECK (criteria_4_score BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS criteria_4_reason TEXT,
  ADD COLUMN IF NOT EXISTS criteria_4_weight DECIMAL(10,2) DEFAULT 1.0,

  ADD COLUMN IF NOT EXISTS criteria_5_score INTEGER CHECK (criteria_5_score BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS criteria_5_reason TEXT,
  ADD COLUMN IF NOT EXISTS criteria_5_weight DECIMAL(10,2) DEFAULT 1.0;

-- Add performance indexes for new columns
CREATE INDEX IF NOT EXISTS idx_post_ratings_criteria_1_score ON post_ratings(criteria_1_score DESC);
CREATE INDEX IF NOT EXISTS idx_post_ratings_criteria_2_score ON post_ratings(criteria_2_score DESC);
CREATE INDEX IF NOT EXISTS idx_post_ratings_criteria_3_score ON post_ratings(criteria_3_score DESC);

-- ================================================================
-- PART 2: MIGRATE EXISTING DATA
-- ================================================================

-- Map legacy columns to new criteria columns
-- Old interest_level (1-20) → criteria_1_score (0-10)
-- Old local_relevance (1-20) → criteria_2_score (0-10)
-- Old community_impact (1-20) → criteria_3_score (0-10)

UPDATE post_ratings
SET
  -- Convert 1-20 scale to 0-10 scale by dividing by 2 and rounding
  criteria_1_score = ROUND((COALESCE(interest_level, 10) / 2.0))::INTEGER,
  criteria_1_reason = COALESCE(
    ai_reasoning,
    'Migrated from legacy interest_level score: ' || COALESCE(interest_level::TEXT, 'N/A')
  ),
  criteria_1_weight = 1.0,

  criteria_2_score = ROUND((COALESCE(local_relevance, 10) / 2.0))::INTEGER,
  criteria_2_reason = COALESCE(
    ai_reasoning,
    'Migrated from legacy local_relevance score: ' || COALESCE(local_relevance::TEXT, 'N/A')
  ),
  criteria_2_weight = 1.5, -- Higher weight for local relevance

  criteria_3_score = ROUND((COALESCE(community_impact, 10) / 2.0))::INTEGER,
  criteria_3_reason = COALESCE(
    ai_reasoning,
    'Migrated from legacy community_impact score: ' || COALESCE(community_impact::TEXT, 'N/A')
  ),
  criteria_3_weight = 1.0

  -- NOTE: total_score is NOT updated here because it may be a GENERATED column
  -- If total_score is a regular column, uncomment the lines below:
  -- , total_score = (
  --   ROUND((COALESCE(interest_level, 10) / 2.0)) * 1.0 +
  --   ROUND((COALESCE(local_relevance, 10) / 2.0)) * 1.5 +
  --   ROUND((COALESCE(community_impact, 10) / 2.0)) * 1.0
  -- )
WHERE
  criteria_1_score IS NULL AND
  criteria_2_score IS NULL AND
  criteria_3_score IS NULL;

-- ================================================================
-- PART 3: ADD CRITERIA CONFIGURATION TO app_settings
-- ================================================================

-- First, get the newsletter_id (assumes single newsletter setup)
-- If you have multiple newsletters, you'll need to run this for each newsletter_id

DO $$
DECLARE
  v_newsletter_id TEXT := NULL;
  v_has_newsletter_column BOOLEAN;
BEGIN
  -- Check if app_settings has newsletter_id column
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'app_settings'
      AND column_name = 'newsletter_id'
  ) INTO v_has_newsletter_column;

  -- Try to get newsletter ID if newsletters table exists
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'newsletters') THEN
      SELECT id INTO v_newsletter_id FROM newsletters LIMIT 1;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_newsletter_id := NULL;
  END;

  RAISE NOTICE 'Newsletter ID: %, Has newsletter_id column: %', v_newsletter_id, v_has_newsletter_column;

  -- Insert criteria configuration
  -- If no newsletter_id column, insert without it
  -- NOTE: value column is JSONB, so we need to cast strings to JSON
  IF v_has_newsletter_column THEN
    INSERT INTO app_settings (newsletter_id, key, value, description, created_at, updated_at)
  VALUES
    -- Global criteria settings
    (v_newsletter_id, 'criteria_enabled_count', '"3"'::jsonb, 'Number of active scoring criteria (1-5)', NOW(), NOW()),

    -- Criterion 1: Interest Level
    (v_newsletter_id, 'criteria_1_name', '"Interest Level"'::jsonb, 'Display name for criterion 1', NOW(), NOW()),
    (v_newsletter_id, 'criteria_1_weight', '"1.0"'::jsonb, 'Weight multiplier for criterion 1', NOW(), NOW()),
    (v_newsletter_id, 'criteria_1_enabled', '"true"'::jsonb, 'Whether criterion 1 is active', NOW(), NOW()),

    -- Criterion 2: Local Relevance
    (v_newsletter_id, 'criteria_2_name', '"Local Relevance"'::jsonb, 'Display name for criterion 2', NOW(), NOW()),
    (v_newsletter_id, 'criteria_2_weight', '"1.5"'::jsonb, 'Weight multiplier for criterion 2 (prioritized)', NOW(), NOW()),
    (v_newsletter_id, 'criteria_2_enabled', '"true"'::jsonb, 'Whether criterion 2 is active', NOW(), NOW()),

    -- Criterion 3: Community Impact
    (v_newsletter_id, 'criteria_3_name', '"Community Impact"'::jsonb, 'Display name for criterion 3', NOW(), NOW()),
    (v_newsletter_id, 'criteria_3_weight', '"1.0"'::jsonb, 'Weight multiplier for criterion 3', NOW(), NOW()),
    (v_newsletter_id, 'criteria_3_enabled', '"true"'::jsonb, 'Whether criterion 3 is active', NOW(), NOW()),

    -- Criteria 4 & 5 (Reserved for future expansion)
    (v_newsletter_id, 'criteria_4_name', '"Criterion 4"'::jsonb, 'Display name for criterion 4', NOW(), NOW()),
    (v_newsletter_id, 'criteria_4_weight', '"1.0"'::jsonb, 'Weight multiplier for criterion 4', NOW(), NOW()),
    (v_newsletter_id, 'criteria_4_enabled', '"false"'::jsonb, 'Whether criterion 4 is active', NOW(), NOW()),

    (v_newsletter_id, 'criteria_5_name', '"Criterion 5"'::jsonb, 'Display name for criterion 5', NOW(), NOW()),
    (v_newsletter_id, 'criteria_5_weight', '"1.0"'::jsonb, 'Weight multiplier for criterion 5', NOW(), NOW()),
    (v_newsletter_id, 'criteria_5_enabled', '"false"'::jsonb, 'Whether criterion 5 is active', NOW(), NOW())
    ON CONFLICT (newsletter_id, key) DO UPDATE SET
      value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = NOW();

    RAISE NOTICE 'Criteria configuration added with newsletter_id: %', v_newsletter_id;
  ELSE
    -- No newsletter_id column, insert without it
    -- NOTE: value column is JSONB, so we need to cast strings to JSON
    INSERT INTO app_settings (key, value, description, created_at, updated_at)
    VALUES
      -- Global criteria settings
      ('criteria_enabled_count', '"3"'::jsonb, 'Number of active scoring criteria (1-5)', NOW(), NOW()),

      -- Criterion 1: Interest Level
      ('criteria_1_name', '"Interest Level"'::jsonb, 'Display name for criterion 1', NOW(), NOW()),
      ('criteria_1_weight', '"1.0"'::jsonb, 'Weight multiplier for criterion 1', NOW(), NOW()),
      ('criteria_1_enabled', '"true"'::jsonb, 'Whether criterion 1 is active', NOW(), NOW()),

      -- Criterion 2: Local Relevance
      ('criteria_2_name', '"Local Relevance"'::jsonb, 'Display name for criterion 2', NOW(), NOW()),
      ('criteria_2_weight', '"1.5"'::jsonb, 'Weight multiplier for criterion 2 (prioritized)', NOW(), NOW()),
      ('criteria_2_enabled', '"true"'::jsonb, 'Whether criterion 2 is active', NOW(), NOW()),

      -- Criterion 3: Community Impact
      ('criteria_3_name', '"Community Impact"'::jsonb, 'Display name for criterion 3', NOW(), NOW()),
      ('criteria_3_weight', '"1.0"'::jsonb, 'Weight multiplier for criterion 3', NOW(), NOW()),
      ('criteria_3_enabled', '"true"'::jsonb, 'Whether criterion 3 is active', NOW(), NOW()),

      -- Criteria 4 & 5 (Reserved for future expansion)
      ('criteria_4_name', '"Criterion 4"'::jsonb, 'Display name for criterion 4', NOW(), NOW()),
      ('criteria_4_weight', '"1.0"'::jsonb, 'Weight multiplier for criterion 4', NOW(), NOW()),
      ('criteria_4_enabled', '"false"'::jsonb, 'Whether criterion 4 is active', NOW(), NOW()),

      ('criteria_5_name', '"Criterion 5"'::jsonb, 'Display name for criterion 5', NOW(), NOW()),
      ('criteria_5_weight', '"1.0"'::jsonb, 'Weight multiplier for criterion 5', NOW(), NOW()),
      ('criteria_5_enabled', '"false"'::jsonb, 'Whether criterion 5 is active', NOW(), NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = NOW();

    RAISE NOTICE 'Criteria configuration added without newsletter_id column';
  END IF;
END $$;

-- ================================================================
-- PART 4: VERIFICATION QUERIES
-- ================================================================

-- Check migration results
SELECT
  'post_ratings migration' as check_type,
  COUNT(*) as total_rows,
  COUNT(criteria_1_score) as criteria_1_populated,
  COUNT(criteria_2_score) as criteria_2_populated,
  COUNT(criteria_3_score) as criteria_3_populated,
  AVG(total_score) as avg_total_score
FROM post_ratings;

-- Check criteria configuration
SELECT
  'app_settings criteria' as check_type,
  COUNT(*) as total_criteria_settings
FROM app_settings
WHERE key LIKE 'criteria_%';

-- Sample migrated data
SELECT
  rp.title,
  pr.interest_level as old_interest,
  pr.criteria_1_score as new_interest_score,
  pr.criteria_1_weight as interest_weight,
  pr.local_relevance as old_relevance,
  pr.criteria_2_score as new_relevance_score,
  pr.criteria_2_weight as relevance_weight,
  pr.community_impact as old_impact,
  pr.criteria_3_score as new_impact_score,
  pr.criteria_3_weight as impact_weight,
  pr.total_score as new_total_score
FROM post_ratings pr
JOIN rss_posts rp ON pr.post_id = rp.id
ORDER BY pr.created_at DESC
LIMIT 5;

-- ================================================================
-- PART 5: ROLLBACK SCRIPT (IF NEEDED)
-- ================================================================

/*
-- TO ROLLBACK THIS MIGRATION, RUN:

-- Remove new columns from post_ratings
ALTER TABLE post_ratings
  DROP COLUMN IF EXISTS criteria_1_score,
  DROP COLUMN IF EXISTS criteria_1_reason,
  DROP COLUMN IF EXISTS criteria_1_weight,
  DROP COLUMN IF EXISTS criteria_2_score,
  DROP COLUMN IF EXISTS criteria_2_reason,
  DROP COLUMN IF EXISTS criteria_2_weight,
  DROP COLUMN IF EXISTS criteria_3_score,
  DROP COLUMN IF EXISTS criteria_3_reason,
  DROP COLUMN IF EXISTS criteria_3_weight,
  DROP COLUMN IF EXISTS criteria_4_score,
  DROP COLUMN IF EXISTS criteria_4_reason,
  DROP COLUMN IF EXISTS criteria_4_weight,
  DROP COLUMN IF EXISTS criteria_5_score,
  DROP COLUMN IF EXISTS criteria_5_reason,
  DROP COLUMN IF EXISTS criteria_5_weight;

-- Drop indexes
DROP INDEX IF EXISTS idx_post_ratings_criteria_1_score;
DROP INDEX IF EXISTS idx_post_ratings_criteria_2_score;
DROP INDEX IF EXISTS idx_post_ratings_criteria_3_score;

-- Remove criteria settings from app_settings
DELETE FROM app_settings
WHERE key LIKE 'criteria_%';

*/

-- ================================================================
-- MIGRATION COMPLETE
-- ================================================================

SELECT 'Multi-criteria scoring migration completed successfully!' as status;
