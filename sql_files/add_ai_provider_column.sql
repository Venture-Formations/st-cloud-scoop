-- Add ai_provider column to app_settings table
-- This allows each AI prompt to specify OpenAI or Perplexity
-- Date: 2025-01-22

-- Add the column with default value 'openai'
ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'openai';

-- Update existing AI prompts to have ai_provider set
UPDATE app_settings
SET ai_provider = 'openai'
WHERE key LIKE 'ai_prompt_%'
AND ai_provider IS NULL;

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'app_settings'
AND column_name = 'ai_provider';
