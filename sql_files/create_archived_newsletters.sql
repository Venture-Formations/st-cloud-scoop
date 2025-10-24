-- =============================================================================
-- NEWSLETTER ARCHIVE SYSTEM - Database Schema
-- =============================================================================
-- Purpose: Create archived_newsletters table for public website display
-- Features: SEO-friendly archive, structured data storage, multi-tenant ready
-- Date: 2025-10-24
-- =============================================================================

-- Create archived_newsletters table
CREATE TABLE IF NOT EXISTS archived_newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Campaign references
  campaign_id UUID NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  newsletter_id VARCHAR(50) NOT NULL DEFAULT 'stcscoop',

  -- URL and display metadata
  campaign_date DATE NOT NULL,                -- YYYY-MM-DD format for URL
  subject_line TEXT NOT NULL,
  send_date TIMESTAMPTZ NOT NULL,
  recipient_count INTEGER DEFAULT 0,

  -- Optional HTML backup
  html_backup TEXT,

  -- Structured data (JSONB for performance and flexibility)
  metadata JSONB DEFAULT '{}'::jsonb,         -- Campaign stats, flags
  articles JSONB DEFAULT '[]'::jsonb,         -- Primary articles array
  secondary_articles JSONB DEFAULT '[]'::jsonb,
  events JSONB DEFAULT '[]'::jsonb,           -- Event newsletter data
  sections JSONB DEFAULT '{}'::jsonb,         -- All sections (welcome, road_work, etc.)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_campaign UNIQUE(campaign_id),
  CONSTRAINT unique_newsletter_date UNIQUE(newsletter_id, campaign_date)
);

-- =============================================================================
-- INDEXES for Performance
-- =============================================================================

-- Index for date-based queries (most common - newest first)
CREATE INDEX IF NOT EXISTS idx_archived_newsletters_date
  ON archived_newsletters(campaign_date DESC);

-- Index for multi-tenant filtering
CREATE INDEX IF NOT EXISTS idx_archived_newsletters_newsletter_id
  ON archived_newsletters(newsletter_id);

-- Composite index for tenant + date queries
CREATE INDEX IF NOT EXISTS idx_archived_newsletters_tenant_date
  ON archived_newsletters(newsletter_id, campaign_date DESC);

-- Index for campaign_id lookups
CREATE INDEX IF NOT EXISTS idx_archived_newsletters_campaign_id
  ON archived_newsletters(campaign_id);

-- =============================================================================
-- TRIGGER for updated_at
-- =============================================================================

-- Update updated_at timestamp on row modification
CREATE OR REPLACE FUNCTION update_archived_newsletters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_archived_newsletters_updated_at ON archived_newsletters;

CREATE TRIGGER trg_update_archived_newsletters_updated_at
  BEFORE UPDATE ON archived_newsletters
  FOR EACH ROW
  EXECUTE FUNCTION update_archived_newsletters_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY (Optional - for multi-tenant isolation)
-- =============================================================================

-- Enable RLS
ALTER TABLE archived_newsletters ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to all archived newsletters
CREATE POLICY "Public read access for archived newsletters"
  ON archived_newsletters
  FOR SELECT
  TO public
  USING (true);

-- Policy: Allow authenticated users to insert/update their own newsletters
CREATE POLICY "Authenticated users can manage their newsletters"
  ON archived_newsletters
  FOR ALL
  TO authenticated
  USING (newsletter_id = current_setting('app.current_newsletter_id', true))
  WITH CHECK (newsletter_id = current_setting('app.current_newsletter_id', true));

-- =============================================================================
-- VERIFICATION QUERY
-- =============================================================================

-- Run this to verify the table was created successfully
-- SELECT
--   table_name,
--   column_name,
--   data_type,
--   is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'archived_newsletters'
-- ORDER BY ordinal_position;

-- =============================================================================
-- SAMPLE INSERT (for testing)
-- =============================================================================

-- INSERT INTO archived_newsletters (
--   campaign_id,
--   newsletter_id,
--   campaign_date,
--   subject_line,
--   send_date,
--   recipient_count,
--   metadata,
--   articles
-- ) VALUES (
--   'YOUR_CAMPAIGN_ID_HERE'::uuid,
--   'stcscoop',
--   '2025-10-24',
--   'St. Cloud This Week',
--   NOW(),
--   1500,
--   '{"total_articles": 5, "has_events": true}'::jsonb,
--   '[{"id": "1", "headline": "Test Article", "content": "Test content"}]'::jsonb
-- );

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
-- Next steps:
-- 1. Create newsletter-archiver.ts service
-- 2. Integrate with send-final route
-- 3. Create public website pages (/newsletter, /newsletter/[date])
-- =============================================================================
