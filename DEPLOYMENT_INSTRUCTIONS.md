# St. Cloud Scoop - Deployment Instructions
## OpenAI/Perplexity AI System with Hourly RSS Ingestion

**Date:** 2025-01-22
**Implementation Status:** Core infrastructure complete, ready for deployment

---

## 📋 What Was Implemented

### ✅ Completed
1. **Database Schema**: Added `ai_provider` column to `app_settings` table
2. **OpenAI.ts Enhancement**:
   - Added Perplexity client
   - Created universal `callAIWithPrompt()` function
   - Updated `callWithStructuredPrompt()` to support both providers
   - Made all 3 previously hardcoded prompts editable (factChecker, roadWorkGenerator, roadWorkValidator)
3. **Prompt Migration Script**: Complete script with all 9 prompts as JSON API requests
4. **RSS Ingestion Endpoint**: `/api/cron/ingest-rss` runs hourly
5. **Workflow Trigger**: `/api/cron/trigger-workflow` checks schedule every 5 minutes
6. **Vercel Configuration**: Updated cron schedules and function timeouts

### ⚠️ TODO (After Deployment)
1. **Settings Page UI**: Add AI provider selector (OpenAI/Perplexity toggle)
2. **API Endpoints**: Update `/api/settings/ai-prompts` to handle `ai_provider` field
3. **7-Step Workflow**: Implement Vercel Workflow SDK when available (currently using existing RSS processor)

---

## 🚀 Deployment Steps

### Step 1: Database Migration

**In Supabase SQL Editor**, run the migration:

```sql
-- Run this file: sql_files/add_ai_provider_column.sql
ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'openai';

UPDATE app_settings
SET ai_provider = 'openai'
WHERE key LIKE 'ai_prompt_%'
AND ai_provider IS NULL;
```

**Verify:**
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'app_settings'
AND column_name = 'ai_provider';
```

You should see:
```
column_name  | data_type | column_default
ai_provider  | text      | 'openai'::text
```

---

### Step 2: Add Environment Variables

#### In Local `.env.local`:
```bash
# Add Perplexity API key
PERPLEXITY_API_KEY=pplx-your-api-key-here
```

#### In Vercel Dashboard:
1. Go to your project → Settings → Environment Variables
2. Add new variable:
   - **Name**: `PERPLEXITY_API_KEY`
   - **Value**: `pplx-your-api-key-here`
   - **Environments**: Production, Preview, Development

**Get Perplexity API Key:**
- Sign up at https://www.perplexity.ai/
- Navigate to API settings
- Create new API key

---

### Step 3: Run Prompt Migration Script

This populates all 9 AI prompts in the database as complete JSON API requests.

```bash
# Install dependencies if needed
npm install

# Run migration script
npx ts-node scripts/migrate-prompts.ts
```

**Expected Output:**
```
🚀 Starting prompt migration to St. Cloud Scoop database...

📊 Total prompts to migrate: 9

📝 Migrating: Content Evaluator (ai_prompt_content_evaluator)
   Provider: openai
   Category: Article Generation
   ✅ Successfully migrated ai_prompt_content_evaluator

📝 Migrating: Newsletter Writer (ai_prompt_newsletter_writer)
   Provider: openai
   Category: Article Generation
   ✅ Successfully migrated ai_prompt_newsletter_writer

... (7 more prompts) ...

================================================================
📊 MIGRATION SUMMARY
================================================================
✅ Successful migrations: 9/9
❌ Failed migrations: 0/9
================================================================

🎉 All prompts migrated successfully!
```

**Verify in Supabase:**
```sql
SELECT key, ai_provider, description
FROM app_settings
WHERE key LIKE 'ai_prompt_%'
ORDER BY key;
```

You should see 9 rows with keys:
- `ai_prompt_content_evaluator` (openai)
- `ai_prompt_newsletter_writer` (openai)
- `ai_prompt_topic_deduper` (openai)
- `ai_prompt_subject_line` (openai)
- `ai_prompt_event_summary` (openai)
- `ai_prompt_image_analyzer` (openai)
- `ai_prompt_fact_checker` (openai)
- `ai_prompt_road_work` (perplexity) ⭐
- `ai_prompt_road_work_validator` (openai)

---

### Step 4: Deploy to Vercel

```bash
# Commit changes
git add .
git commit -m "Implement OpenAI/Perplexity AI system with hourly RSS ingestion

- Add Perplexity client support
- Create universal callAIWithPrompt() function
- Make all 9 AI prompts editable via database
- Add hourly RSS ingestion endpoint
- Add workflow trigger endpoint
- Update vercel.json with new cron schedules"

# Push to deploy
git push origin main
```

**Vercel will automatically:**
- Deploy the new code
- Register new cron jobs:
  - `/api/cron/ingest-rss` → Every hour (0 * * * *)
  - `/api/cron/trigger-workflow` → Every 5 minutes (*/5 * * * *)
- Apply function timeout settings

---

### Step 5: Verify Deployment

#### Check Vercel Deployment
1. Go to Vercel Dashboard → Your Project
2. Wait for deployment to complete (usually 2-3 minutes)
3. Check deployment logs for errors

#### Check Cron Jobs
1. Vercel Dashboard → Your Project → Cron Jobs
2. Verify new crons are registered:
   - `/api/cron/ingest-rss` - Every hour
   - `/api/cron/trigger-workflow` - Every 5 minutes

#### Test RSS Ingestion Manually
```bash
# Replace with your actual domain
curl "https://your-app.vercel.app/api/cron/ingest-rss?secret=YOUR_CRON_SECRET"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Processed 10 feeds",
  "totalFetched": 150,
  "totalNewPosts": 25,
  "feeds": [
    {"name": "St. Cloud Times", "fetched": 20, "new": 5},
    {"name": "WJON News", "fetched": 15, "new": 3},
    ...
  ],
  "timestamp": "2025-01-22T..."
}
```

#### Test Workflow Trigger Manually
```bash
curl "https://your-app.vercel.app/api/cron/trigger-workflow?secret=YOUR_CRON_SECRET"
```

**Expected Response (if not scheduled time):**
```json
{
  "success": true,
  "message": "Not scheduled at this time",
  "skipped": true,
  "timestamp": "2025-01-22T..."
}
```

---

## 🧪 Testing Checklist

### Test 1: Database Schema
- [ ] `ai_provider` column exists in `app_settings`
- [ ] All existing prompts have `ai_provider = 'openai'`
- [ ] No errors in Supabase logs

### Test 2: Prompt Migration
- [ ] All 9 prompts migrated successfully
- [ ] Prompts stored as complete JSON objects
- [ ] Road Work Generator uses `ai_provider = 'perplexity'`
- [ ] All other prompts use `ai_provider = 'openai'`

### Test 3: RSS Ingestion
- [ ] Manual test returns success
- [ ] New posts appear in `rss_posts` table
- [ ] No duplicate posts created
- [ ] All active feeds processed

### Test 4: OpenAI Integration
- [ ] Content Evaluator works (test via existing RSS processing)
- [ ] Newsletter Writer generates articles
- [ ] Subject Line Generator creates headlines
- [ ] No API errors in Vercel logs

### Test 5: Perplexity Integration (if API key configured)
- [ ] Road Work Generator uses Perplexity
- [ ] Real-time web search results appear
- [ ] 6-9 road work items generated
- [ ] No API errors

### Test 6: Workflow Trigger
- [ ] Cron runs every 5 minutes (check Vercel logs)
- [ ] Correctly detects scheduled vs non-scheduled times
- [ ] Updates `last_rss_processing_run` setting
- [ ] No false positives (shouldn't run multiple times per day)

### Test 7: End-to-End
- [ ] RSS ingestion populates posts hourly
- [ ] Campaign generation works at scheduled time (8:30 PM CT)
- [ ] All AI prompts execute successfully
- [ ] Newsletter preview shows all sections
- [ ] Email sends correctly

---

## 📊 Monitoring

### Vercel Logs
Monitor these endpoints for the first 24 hours:
1. `/api/cron/ingest-rss` - Check for RSS parsing errors
2. `/api/cron/trigger-workflow` - Verify scheduling logic
3. `/api/cron/rss-processing` - Monitor full campaign generation

**Access Logs:**
Vercel Dashboard → Your Project → Logs

**Look for:**
- ✅ `[RSS Ingest] Complete: 150 items fetched, 25 new posts saved`
- ✅ `[Workflow Trigger] Starting RSS workflow for St. Cloud Scoop`
- ❌ Any errors or timeouts

### Database Queries

**Check RSS Posts Growth:**
```sql
SELECT
  DATE(processed_at) as date,
  COUNT(*) as posts_added
FROM rss_posts
WHERE processed_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(processed_at)
ORDER BY date DESC;
```

**Check AI Prompt Usage:**
```sql
SELECT
  key,
  ai_provider,
  updated_at
FROM app_settings
WHERE key LIKE 'ai_prompt_%'
ORDER BY updated_at DESC;
```

**Check Campaign Status:**
```sql
SELECT
  id,
  date,
  status,
  subject_line,
  created_at
FROM newsletter_campaigns
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

---

## 🐛 Troubleshooting

### Issue: RSS Ingestion Not Running

**Symptoms:**
- No new posts in `rss_posts` table
- Cron logs show no activity

**Solutions:**
1. Check Vercel Cron Jobs are registered:
   ```
   Vercel Dashboard → Cron Jobs → /api/cron/ingest-rss should show "Every hour"
   ```

2. Test manually with secret:
   ```bash
   curl "https://your-app.vercel.app/api/cron/ingest-rss?secret=YOUR_SECRET"
   ```

3. Check cron syntax in `vercel.json`:
   ```json
   {"path": "/api/cron/ingest-rss", "schedule": "0 * * * *"}
   ```

### Issue: Perplexity API Errors

**Symptoms:**
- Road Work section empty or contains errors
- Vercel logs show Perplexity API errors

**Solutions:**
1. Verify API key is set:
   ```bash
   # In Vercel Dashboard → Settings → Environment Variables
   PERPLEXITY_API_KEY=pplx-...
   ```

2. Check Perplexity account status and credits

3. Temporarily switch Road Work Generator to OpenAI:
   ```sql
   UPDATE app_settings
   SET ai_provider = 'openai'
   WHERE key = 'ai_prompt_road_work';
   ```

### Issue: Workflow Trigger Running Too Often

**Symptoms:**
- Multiple campaigns created per day
- `last_rss_processing_run` not updating

**Solutions:**
1. Check `app_settings` table:
   ```sql
   SELECT * FROM app_settings WHERE key = 'last_rss_processing_run';
   ```

2. Manually set last run date to today:
   ```sql
   INSERT INTO app_settings (key, value, description)
   VALUES ('last_rss_processing_run', '2025-01-22', 'Last date RSS processing ran')
   ON CONFLICT (key) DO UPDATE SET value = '2025-01-22';
   ```

3. Check schedule settings:
   ```sql
   SELECT * FROM app_settings
   WHERE key IN ('email_reviewScheduleEnabled', 'email_rssProcessingTime');
   ```

### Issue: AI Prompts Not Loading

**Symptoms:**
- "Prompt not found in database" warnings
- Falling back to code defaults

**Solutions:**
1. Verify prompts exist in database:
   ```sql
   SELECT COUNT(*) FROM app_settings WHERE key LIKE 'ai_prompt_%';
   -- Should return 9
   ```

2. Re-run migration script:
   ```bash
   npx ts-node scripts/migrate-prompts.ts
   ```

3. Check for JSON parsing errors in Vercel logs

### Issue: Function Timeouts

**Symptoms:**
- 504 Gateway Timeout errors
- Incomplete campaign generation

**Solutions:**
1. Check function duration limits in `vercel.json`:
   ```json
   "app/api/cron/rss-processing/route.ts": {"maxDuration": 720}
   ```

2. Monitor actual execution time in Vercel logs

3. If consistently timing out, consider:
   - Reducing number of articles generated
   - Splitting into smaller batches
   - Upgrading Vercel plan for longer timeouts

---

## 📈 Expected Behavior

### Hourly RSS Ingestion (0 * * * *)
- **Frequency**: Every hour on the hour (e.g., 1:00, 2:00, 3:00)
- **Duration**: 1-3 minutes depending on feed count
- **Result**: 10-50 new posts per hour (varies by feed activity)

### Workflow Trigger (*/5 * * * *)
- **Frequency**: Every 5 minutes
- **Scheduled Run**: Only at 8:30 PM CT (or your configured time)
- **Duration**: 5-10 seconds for scheduling check
- **Result**: Triggers full RSS processing once per day

### Full RSS Processing (triggered by workflow)
- **Frequency**: Once per day at scheduled time
- **Duration**: 7-12 minutes
- **Steps**:
  1. Select top 15 scored posts
  2. Deduplicate similar stories
  3. Generate 10 Local Scoop articles
  4. Fact-check all articles
  5. Populate 8 events per day
  6. Generate 9 road work items
  7. Create subject line and finalize

---

## 🎯 Success Criteria

### ✅ Deployment Successful When:
1. All 9 AI prompts migrated to database
2. RSS ingestion runs every hour without errors
3. New posts appear in database hourly
4. Workflow trigger correctly identifies scheduled time
5. Campaign generation completes successfully
6. Newsletter preview shows all sections
7. No timeout or API errors in logs

### ✅ System Healthy When:
1. `rss_posts` table grows by 200-500 posts per day
2. Daily campaigns generate successfully at 8:30 PM CT
3. All AI prompts execute without fallback warnings
4. Perplexity road work generation returns 6-9 items
5. Email sends successfully to review group
6. No recurring errors in Vercel logs

---

## 📝 Next Steps (After Successful Deployment)

### Phase 2: Settings UI Enhancement (Optional)
**Goal:** Add AI provider selector to Settings > AI Prompts page

**Tasks:**
1. Add OpenAI/Perplexity toggle buttons
2. Add format indicator (Structured JSON vs Plain Text)
3. Update save endpoint to handle `ai_provider`
4. Add test modal with detailed results

**Estimated Time:** 2-3 hours

### Phase 3: 7-Step Workflow (When Ready)
**Goal:** Replace single function with Vercel Workflow SDK

**Requirements:**
1. Install `@vercel/workflow` package when available
2. Create workflow file with 7 steps
3. Update trigger endpoint to use `start()` function
4. Test step-by-step execution

**Estimated Time:** 4-6 hours

### Phase 4: Testing Playground (Optional)
**Goal:** Build dedicated AI testing page

**Features:**
- Test prompts with real RSS posts
- Test with 10 articles (batch testing)
- View API request/response details
- Save test history

**Estimated Time:** 4-6 hours

---

## 📞 Support

### Common Questions

**Q: Can I use only OpenAI without Perplexity?**
A: Yes! The system defaults to OpenAI. Perplexity is only used for Road Work Generator. You can switch it to OpenAI:
```sql
UPDATE app_settings SET ai_provider = 'openai' WHERE key = 'ai_prompt_road_work';
```

**Q: How do I edit AI prompts?**
A: Currently, edit directly in database via Supabase SQL Editor. Settings UI enhancement (Phase 2) will add web interface.

**Q: What if RSS ingestion fails for one feed?**
A: The system continues processing other feeds. Failed feeds are logged but don't stop the entire process.

**Q: Can I change ingestion frequency?**
A: Yes! Edit `vercel.json`:
- Every 4 hours: `"schedule": "0 */4 * * *"`
- Every 2 hours: `"schedule": "0 */2 * * *"`
- Every 30 minutes: `"schedule": "*/30 * * * *"`

**Q: How do I roll back if something breaks?**
A:
```bash
git revert HEAD
git push origin main
```
Then manually restore database if needed.

---

## ✅ Deployment Complete

If you've completed all steps above, your St. Cloud Scoop system now has:

✅ OpenAI + Perplexity AI providers
✅ All 9 AI prompts editable via database
✅ Hourly RSS ingestion
✅ Improved reliability with workflow trigger
✅ Better timeout handling
✅ Enhanced debugging and monitoring

**Congratulations! 🎉**

Monitor the system for the first 24-48 hours and review Vercel logs for any issues.

---

**Last Updated:** 2025-01-22
**Version:** 1.0
**Author:** Claude Code Assistant
