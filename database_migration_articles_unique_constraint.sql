-- Migration: Add unique constraint to prevent duplicate articles for the same post+campaign
-- Date: 2025-11-25
-- Description: Prevents multiple articles from being created for the same RSS post within a campaign

-- First, remove any existing duplicates (keep the earliest created one)
DELETE FROM articles a1
WHERE EXISTS (
  SELECT 1 FROM articles a2
  WHERE a2.post_id = a1.post_id
    AND a2.campaign_id = a1.campaign_id
    AND a2.created_at < a1.created_at
);

-- Add unique constraint on post_id + campaign_id
ALTER TABLE articles
ADD CONSTRAINT articles_post_campaign_unique
UNIQUE (post_id, campaign_id);

-- Verify the constraint was added
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'articles' AND constraint_type = 'UNIQUE';
