-- AI Prompt System Migration: TEXT → JSONB
-- Purpose: Enable structured prompts with model parameters and few-shot learning
-- Date: 2025-01-24
-- IMPORTANT: Run this during low-traffic window and test on staging first!

-- =============================================================================
-- STEP 1: BACKUP EXISTING DATA
-- =============================================================================
-- Creates backup table with all current prompt data
CREATE TABLE IF NOT EXISTS app_settings_backup_20250124 AS
SELECT * FROM app_settings;

-- Verify backup was created successfully
DO $$
DECLARE
  backup_count INTEGER;
  original_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backup_count FROM app_settings_backup_20250124;
  SELECT COUNT(*) INTO original_count FROM app_settings;

  IF backup_count != original_count THEN
    RAISE EXCEPTION 'Backup failed! Backup has % rows, original has % rows', backup_count, original_count;
  END IF;

  RAISE NOTICE 'Backup created successfully: % rows backed up', backup_count;
END $$;

-- =============================================================================
-- STEP 2: CONVERT VALUE COLUMN TO JSONB
-- =============================================================================
-- Convert value column from TEXT to JSONB
-- Plain text strings are wrapped in JSONB text format
ALTER TABLE app_settings
  ALTER COLUMN value TYPE JSONB
  USING CASE
    WHEN value IS NULL THEN NULL
    WHEN value ~ '^\s*[\{\[]' THEN value::jsonb  -- Already JSON format
    ELSE to_jsonb(value::text)  -- Plain text, wrap in JSONB
  END;

-- =============================================================================
-- STEP 3: CONVERT CUSTOM_DEFAULT COLUMN TO JSONB
-- =============================================================================
-- Convert custom_default column (if exists) from TEXT to JSONB
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_settings' AND column_name = 'custom_default'
  ) THEN
    ALTER TABLE app_settings
      ALTER COLUMN custom_default TYPE JSONB
      USING CASE
        WHEN custom_default IS NULL THEN NULL
        WHEN custom_default ~ '^\s*[\{\[]' THEN custom_default::jsonb
        ELSE to_jsonb(custom_default::text)
      END;
    RAISE NOTICE 'custom_default column converted to JSONB';
  ELSE
    RAISE NOTICE 'custom_default column does not exist, skipping';
  END IF;
END $$;

-- =============================================================================
-- STEP 4: ADD CREATED_AT COLUMN IF MISSING
-- =============================================================================
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill created_at with updated_at for existing rows
UPDATE app_settings
SET created_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL;

-- =============================================================================
-- STEP 5: ADD NOT NULL CONSTRAINT TO VALUE
-- =============================================================================
-- Ensure all existing rows have non-null values before adding constraint
UPDATE app_settings
SET value = to_jsonb('PLACEHOLDER - NEEDS CONFIGURATION'::text)
WHERE value IS NULL;

-- Add NOT NULL constraint
ALTER TABLE app_settings
  ALTER COLUMN value SET NOT NULL;

-- =============================================================================
-- STEP 6: CREATE INDEXES FOR PERFORMANCE
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);
CREATE INDEX IF NOT EXISTS idx_app_settings_created_at ON app_settings(created_at);

-- =============================================================================
-- STEP 7: VERIFY MIGRATION SUCCESS
-- =============================================================================
DO $$
DECLARE
  prompt_count INTEGER;
  jsonb_count INTEGER;
BEGIN
  -- Check total prompts
  SELECT COUNT(*) INTO prompt_count FROM app_settings WHERE key LIKE 'ai_prompt_%';
  RAISE NOTICE 'Total AI prompts found: %', prompt_count;

  -- Check JSONB conversion
  SELECT COUNT(*) INTO jsonb_count
  FROM app_settings
  WHERE key LIKE 'ai_prompt_%' AND jsonb_typeof(value) IS NOT NULL;
  RAISE NOTICE 'Prompts successfully converted to JSONB: %', jsonb_count;

  IF prompt_count != jsonb_count THEN
    RAISE WARNING 'JSONB conversion incomplete! % prompts exist but only % converted', prompt_count, jsonb_count;
  ELSE
    RAISE NOTICE '✓ All prompts successfully converted to JSONB format';
  END IF;
END $$;

-- =============================================================================
-- STEP 8: DISPLAY CURRENT PROMPTS FOR VERIFICATION
-- =============================================================================
SELECT
  key,
  description,
  CASE
    WHEN jsonb_typeof(value) = 'object' AND value ? 'messages' THEN 'Structured JSON'
    WHEN jsonb_typeof(value) = 'string' THEN 'Plain Text'
    ELSE 'Unknown Format'
  END as format_type,
  LENGTH(value::text) as content_length,
  updated_at
FROM app_settings
WHERE key LIKE 'ai_prompt_%'
ORDER BY key;

-- =============================================================================
-- ROLLBACK INSTRUCTIONS (IF NEEDED)
-- =============================================================================
-- IF MIGRATION FAILS, RUN THIS TO RESTORE FROM BACKUP:
--
-- DROP TABLE app_settings;
-- ALTER TABLE app_settings_backup_20250124 RENAME TO app_settings;
--
-- Then recreate indexes:
-- CREATE INDEX idx_app_settings_key ON app_settings(key);
-- =============================================================================

-- =============================================================================
-- CLEANUP INSTRUCTIONS (AFTER VERIFYING SUCCESS)
-- =============================================================================
-- After verifying the migration works correctly for 1 week, run:
-- DROP TABLE app_settings_backup_20250124;
-- =============================================================================
