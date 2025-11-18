import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Migrate post_ratings table to support multi-criteria system
 * This updates the schema from fixed columns to flexible criteria columns
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Schema Migration] Starting post_ratings schema migration...')

    // SQL to update the post_ratings table schema
    const migrationSQL = `
      -- Step 1: Drop the old GENERATED ALWAYS column
      ALTER TABLE post_ratings DROP COLUMN IF EXISTS total_score;

      -- Step 2: Drop old fixed criteria columns if they exist
      ALTER TABLE post_ratings DROP COLUMN IF EXISTS interest_level;
      ALTER TABLE post_ratings DROP COLUMN IF EXISTS local_relevance;
      ALTER TABLE post_ratings DROP COLUMN IF EXISTS community_impact;
      ALTER TABLE post_ratings DROP COLUMN IF EXISTS ai_reasoning;

      -- Step 3: Add new total_score column (not generated)
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS total_score NUMERIC NOT NULL DEFAULT 0;

      -- Step 4: Add flexible criteria columns (support up to 5 criteria)
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_1_score INTEGER;
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_1_reason TEXT;
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_1_weight NUMERIC;

      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_2_score INTEGER;
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_2_reason TEXT;
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_2_weight NUMERIC;

      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_3_score INTEGER;
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_3_reason TEXT;
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_3_weight NUMERIC;

      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_4_score INTEGER;
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_4_reason TEXT;
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_4_weight NUMERIC;

      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_5_score INTEGER;
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_5_reason TEXT;
      ALTER TABLE post_ratings ADD COLUMN IF NOT EXISTS criteria_5_weight NUMERIC;
    `

    // Execute the migration using raw SQL
    const { error: migrationError } = await supabaseAdmin.rpc('exec_sql', {
      sql: migrationSQL
    })

    if (migrationError) {
      // If RPC doesn't exist, provide manual SQL instructions
      return NextResponse.json({
        success: false,
        error: 'Migration requires manual execution',
        message: 'Please run the following SQL in your Supabase SQL Editor:',
        sql: migrationSQL,
        instructions: [
          '1. Go to Supabase Dashboard > SQL Editor',
          '2. Create a new query',
          '3. Copy and paste the SQL above',
          '4. Click "Run"',
          '5. Refresh this endpoint to verify the migration'
        ]
      }, { status: 500 })
    }

    console.log('[Schema Migration] ✓ Migration completed successfully')

    return NextResponse.json({
      success: true,
      message: 'Schema migration completed successfully',
      changes: [
        'Removed old GENERATED ALWAYS total_score column',
        'Removed fixed criteria columns (interest_level, local_relevance, community_impact)',
        'Added new total_score column (writable)',
        'Added flexible criteria_X_score, criteria_X_reason, criteria_X_weight columns (1-5)'
      ]
    })

  } catch (error) {
    console.error('[Schema Migration] Error:', error)
    return NextResponse.json({
      error: 'Migration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
