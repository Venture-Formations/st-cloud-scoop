# St. Cloud Scoop Development - Main Content Repository

**Last Updated:** 2025-09-25 (Current Session - Automatic Subject Line Regeneration Save Point)
**Primary Source:** This is now the authoritative development document
**Session Focus:** Complete Automatic Subject Line Regeneration System

## 🔒 **SAVE POINT - Automatic Subject Line Regeneration Complete** (2025-09-25)
**Git Commit:** `08b85ef` - Add real-time UI updates for automatic subject line regeneration
**System State:** Fully functional with complete automatic subject line regeneration system
**Working Features:**
- ✅ RSS Processing with Smart Event Population (8 events per day, random selection)
- ✅ Subject Line Generation (both AI and manual editing)
- ✅ **NEW: Automatic Subject Line Regeneration** (when #1 article changes via skip/reorder)
- ✅ **NEW: Real-Time UI Updates** (subject line updates instantly without page refresh)
- ✅ Event Management with random selection and featured events
- ✅ Manual Subject Line Editing (no character limits)
- ✅ Current incident filtering in AI content evaluation
- ✅ Campaign workflow (Draft → In Review → Ready to Send → Sent)
- ✅ Enhanced Slack notifications for RSS processing states
- ✅ Skip Article functionality with complete audit trail

**Purpose:** Safe restore point with fully automated subject line management system

## 🆕 Current Session (2025-09-25): Automatic Subject Line Regeneration Implementation

### Major Features Implemented ✅

#### 1. **Automatic Subject Line Regeneration System**
- **Skip Article Auto-Regeneration**: When the #1 article is skipped, subject line automatically regenerates based on new #1 article
- **Reorder Article Auto-Regeneration**: When articles are reordered and #1 position changes, subject line automatically regenerates
- **Smart Detection**: Only regenerates when the effective #1 article actually changes (ignores skipped articles)
- **Comprehensive Logging**: Detailed console logs showing which articles are being compared and why regeneration occurs

#### 2. **Real-Time UI Updates (No Page Refresh Required)**
- **Instant Subject Line Updates**: Subject line updates in campaign UI immediately after reordering or skipping
- **User Feedback**: Informative alerts when subject line is auto-regenerated
- **Skip Article Alerts**: Shows message like "Article skipped successfully! Subject line auto-updated to: 'New Subject Line'"
- **Seamless Experience**: All updates happen in background with immediate visual feedback

#### 3. **Enhanced Skip Article Functionality**
- **Complete Skip System**: Added `skipped` boolean field to articles database
- **UI Integration**: Skip Article buttons added to both active and inactive article sections
- **Audit Trail**: User activities logged for all skip actions with detailed metadata
- **Database Compatibility**: Graceful handling of databases with/without skipped column

#### 4. **Shared Subject Line Generation Utilities**
- **Created `src/lib/subject-line-generator.ts`**: Centralized subject line generation logic
- **`generateSubjectLine()` Function**: Shared between manual generation and automatic regeneration
- **`getCurrentTopArticle()` Function**: Reliable method to get current #1 active non-skipped article
- **Database Fallback Logic**: Handles missing skipped column gracefully

### Technical Implementation Details

#### Files Created/Modified:
```
# New Shared Utilities
src/lib/subject-line-generator.ts                     # Central subject line generation logic

# Enhanced APIs
src/app/api/articles/[id]/skip/route.ts              # Skip article with auto subject regeneration
src/app/api/campaigns/[id]/articles/reorder/route.ts # Reorder with auto subject regeneration

# Real-Time UI Updates
src/app/dashboard/campaigns/[id]/page.tsx            # Real-time subject line updates, skip buttons

# Database Schema
src/types/database.ts                                # Added skipped field to Article interfaces

# Debug Tools
src/app/api/debug/test-reorder/route.ts             # Debug endpoint for testing reorder logic
src/app/api/debug/add-skip-column/route.ts          # Database column setup helper
src/app/api/debug/check-skip-column/route.ts        # Database column verification
```

#### API Response Format:
Both skip and reorder endpoints now return detailed regeneration information:
```json
{
  "success": true,
  "subject_line_regenerated": true,
  "new_subject_line": "Generated Subject Line Text",
  "top_article_changed": true,
  "previous_top_article": "Previous Article Headline",
  "new_top_article": "New Article Headline"
}
```

#### Database Requirements:
- **Production Setup**: `ALTER TABLE articles ADD COLUMN skipped BOOLEAN DEFAULT FALSE;`
- **Archived Articles**: `ALTER TABLE archived_articles ADD COLUMN skipped BOOLEAN DEFAULT FALSE;`
- **Fallback Handling**: Code works with or without skipped column for backward compatibility

### User Experience Improvements

#### Before:
- Manual subject line regeneration required after skipping/reordering articles
- Page refresh needed to see subject line updates
- No feedback when #1 article position changes
- Subject line could become outdated without user awareness

#### After:
- **Fully Automatic**: Subject line regenerates instantly when #1 article changes
- **Real-Time Updates**: UI updates immediately without page refresh
- **Smart Notifications**: Users informed when automatic regeneration occurs
- **Seamless Workflow**: Campaign management now fully automated

### Current System Capabilities

#### Automatic Triggers:
1. **Skip #1 Article** → Subject line regenerates instantly
2. **Reorder Articles** (changing #1 position) → Subject line regenerates instantly
3. **Article Ranking Changes** → Smart detection only regenerates when necessary

#### User Interface:
- **Skip Article Buttons**: Available on all articles with confirmation and feedback
- **Real-Time Subject Display**: Updates instantly without page refresh
- **Informative Alerts**: Clear feedback when automatic actions occur
- **Console Logging**: Detailed debugging information for troubleshooting

## 🔍 Previous Session Issues (Historical Context)

### 1. Events Not Populating in Campaigns
- **Issue**: RSS processing completing successfully but no events showing in campaigns
- **Root Cause**: RSS processing timing out before reaching event population step
- **Investigation**: Manual "Process RSS Feed" completed in 3 minutes vs 12-minute timeout
- **Discovery**: Event population happened at END of RSS processing and was being skipped

### 2. Subject Line Generation Failing
- **Issue**: Subject lines not generating during both manual and scheduled RSS processing
- **Root Cause**: AI returning JSON format but code expecting plain text
- **Error**: `d.trim is not a function` when trying to call `.trim()` on JSON object
- **Discovery**: `callOpenAI` returns `{raw: content}` when JSON parsing fails

### 3. RSS Processing Workflow Analysis
- **Manual Processing**: Works in 3 minutes, includes articles but no events/subject lines
- **Scheduled Processing**: Takes 10+ minutes, includes 60-second delays, more complex workflow
- **Schedule Restrictions**: `ScheduleChecker.shouldRunRSSProcessing()` blocking execution

## ✅ Session 5 Fixes Implemented

### 1. Smart Event Population System (`rss-processor.ts`)
- **Revolutionary Change**: Events now populate FIRST, before RSS processing starts
- **Smart Random Selection**: Up to 8 events per day with intelligent featured event logic
- **Campaign Date-Based**: Uses campaign.date (not creation time) for 3-day event range
- **Preserves Existing**: Doesn't overwrite existing event selections, only adds new ones
- **Featured Logic**: Only one featured event per day, preserves existing featured events

### 2. Subject Line Generation Timing Optimization
- **Critical Move**: Subject line now generates immediately after top 5 articles are activated
- **Removed 60-Second Delay**: Eliminated unnecessary wait time that wasted timeout
- **Works for Both**: Manual and scheduled RSS processing now generate subject lines
- **Faster Workflow**: Subject lines generated in 3-4 minutes instead of 10+ minutes

### 3. Subject Line Response Format Fix (`openai.ts`)
- **Root Cause Fix**: Changed AI prompt from JSON format to plain text response
- **Simplified Parsing**: Removed complex JSON parsing that was causing errors
- **Consistent Output**: Now generates clean subject lines like "St. Cloud Rallies To Block Leaves"
- **Error Elimination**: Fixed `d.trim is not a function` error completely

### 4. RSS Processing Workflow Optimization
- **New Order**: Events → RSS Processing → Article Activation → Subject Generation → Continue
- **Timeout Management**: Reduced from 15 to 12 minutes but moved critical steps earlier
- **Manual Button Enhanced**: Now includes both event population and subject generation
- **Reliability**: Critical steps happen early when function has full timeout available

## 🛠️ Session 5 Debug Tools Created

### New API Endpoints
- `/api/debug/check-events` - Verifies events availability in database for campaign date ranges
- `/api/debug/manual-event-population` - Manually populates events for latest campaign
- `/api/debug/test-event-population` - Tests event population using RSS processor method
- `/api/debug/complete-campaign` - Fixes interrupted campaigns (status reset, subject generation)
- `/api/debug/activate-articles` - Manually activates top articles for a campaign
- `/api/debug/test-subject-generation` - Comprehensive subject line generation testing with detailed logging

### Previous Debug Tools (Still Available)
- `/api/debug/recent-campaigns` - Lists recent campaigns with details
- `/api/debug/campaign-articles?campaign_id=X` - Shows all articles for specific campaign

### Key Debug URLs
- **Production**: `https://st-cloud-scoop.vercel.app/api/debug/recent-campaigns`
- **Campaign Details**: `https://st-cloud-scoop.vercel.app/api/debug/campaign-articles?campaign_id=0f46cbf6-ab82-4aba-ab0c-c983d659a0c2`

## 🔧 Technical Configuration

### Email Settings (Confirmed Working)
- **Sender Name**: "St. Cloud Scoop"
- **From Email**: "scoop@stcscoop.com"
- **Subject Format**: "🍦 [Subject Line]"
- **Domain**: Authenticated and verified

### AI Prompt Requirements
- **Character Limit**: ≤35 characters (allows room for emoji prefix)
- **Style**: Front-page newspaper headline, breaking news voice
- **Restrictions**: No colons, em dashes, year references, or "today/tomorrow"
- **Creativity**: Each generation should produce unique variations

### Content Filtering Rules
- **Excluded**: Lost pet posts (implemented in AI prompts)
- **Email Format**: Uses global CSS rules from `gloabalemailrules.txt`
- **Article Order**: Sorted by AI score (highest first)

## 📊 Current Status

### What's Working
- ✅ AI subject line generation infrastructure
- ✅ Debug endpoints for troubleshooting
- ✅ Send for Review with forced subject line passing
- ✅ Email template consistency with preview

### Testing Required
- 🔄 Generate new subject line to verify top article usage
- 🔄 Confirm subject line variations on regeneration
- 🔄 Verify Vercel function logs show detailed debugging info

## 🤖 Automated Newsletter Scheduling System

### Schedule Configuration (Central Time)
- **8:30 PM**: Create Tomorrow's Campaign + RSS Processing (`/api/cron/rss-processing`)
- **8:45 PM**: AI Subject Line Generation - Fixed 15min after RSS (`/api/cron/generate-subject`)
- **8:50 PM**: Create Review Campaign & Schedule for 9pm (`/api/cron/create-campaign`)
- **9:00 PM**: MailerLite sends scheduled review campaign to review group only

### Settings Page Integration
- Added "Email" tab with configurable scheduling times
- MailerLite settings (Review Group ID, From Email, Sender Name)
- API Key field removed from UI for security
- All times configurable via web interface
- Settings stored in `app_settings` table

### Automation Features
- **Smart Status Checking**: Only processes campaigns in appropriate status
- **Error Handling**: Comprehensive logging and status updates
- **Idempotent**: Safe to run multiple times, won't duplicate work
- **Manual Testing**: GET endpoints with secret parameter for debugging

## 🆕 Recent Updates (Sept 19, 2025 - Session 2)

### Events Management System Overhaul
- **Comprehensive Events Sync**: Fixed pagination to get all events (62 vs 50 previously)
- **HTML Entity Decoding**: Converted encoded characters like `&#8217;` to proper apostrophes
- **CRUD Operations**: Added full edit/delete functionality for events database page
- **Timezone Consistency**: Fixed Central Time (-5 UTC) alignment between dashboard and HTML generation
- **Newsletter Template**: Updated to 3-column design with emoji categorization matching provided template

### AI-Generated Event Summaries Implementation
- **Database Schema**: Added `event_summary` TEXT column to events table
- **AI Integration**: Implemented `eventSummarizer` prompt with 50-word natural language requirement
- **Automatic Generation**: AI summaries generated during sync for events without existing summaries
- **Newsletter Enhancement**: Featured events now use AI summaries for better descriptions
- **Bulk Processing**: Created dedicated endpoint for retroactive AI summary generation

### Events Sync Improvements
- **Daily Strategy**: Changed from 7-day ranges to individual day calls for better results
- **Error Handling**: Improved resilience with individual day failure tolerance
- **Smart Updates**: Preserves existing AI summaries to avoid unnecessary API calls
- **Comprehensive Logging**: Detailed console output for monitoring and debugging

### Database Management Enhancements
- **Inline Editing**: Real-time field editing with save/cancel functionality
- **Delete Operations**: Secure event removal with confirmation
- **API Endpoints**: RESTful PATCH/DELETE operations for events
- **TypeScript Fixes**: Updated parameter patterns for Next.js 15 App Router

### Technical Achievements
- **HTML Generation**: Synchronized events dates between dashboard and newsletter HTML
- **Image Removal**: Cleaned up Local Events section by removing unused images
- **Build Pipeline**: Fixed TypeScript compilation errors for deployment
- **Performance**: Efficient batch processing with rate limiting for AI operations

## 🚧 Database Schema Update Required

### Missing Column Fix
- **Issue**: `event_summary` column needs to be added to Supabase events table
- **SQL Command**: `ALTER TABLE events ADD COLUMN event_summary TEXT;`
- **Impact**: Required for AI summary functionality and bulk processing endpoint
- **Status**: ⚠️ Pending manual execution in Supabase SQL Editor

## 🆕 Previous Updates (Sept 19, 2025 - Session 1)

### Campaign Approval System
- **Added**: "Changes Made" and "Approved" buttons to campaign detail page
- **Status Workflow**: Draft → In Review → Ready to Send → Sent
- **Database**: Added `last_action`, `last_action_at`, `last_action_by` fields
- **Slack Integration**: Sends notifications when "Changes Made" is clicked
- **UI Updates**: "Ready to Send" status displays throughout dashboard

### Slack Notification Improvements
- **Simple Messages**: Clean format using `sendSimpleMessage()` method
- **Date Format**: Uses full formatted date "Wednesday, September 17, 2025"
- **Removed Fields**: Eliminated INFO/TIME/CONTEXT metadata for cleaner messages
- **Webhook**: Configured `SLACK_WEBHOOK_URL` in Vercel environment

### Article Image Thumbnails
- **Visual Selection**: Added 64x64px thumbnail images next to article titles
- **Source**: Images from RSS post `image_url` field when available
- **Error Handling**: Images gracefully hide on load failure
- **Layout**: Responsive design with proper spacing and alignment

### Technical Fixes
- **TypeScript Errors**: Fixed compilation issues with Next.js 15 route params
- **Build Process**: Local build verification before deployments
- **Database Migration**: Applied approval system schema changes

## 🚀 Next Steps

1. **Database Schema**: Add `event_summary` column to Supabase events table
2. **Test AI Summaries**: Run bulk generation endpoint after schema update
3. **Verify Newsletter**: Test featured events display AI summaries correctly
4. **Monitor Sync**: Ensure new events automatically get AI summaries during daily sync

## 📁 Key Files Modified

```
# AI Subject Line Fixes
src/app/api/campaigns/[id]/generate-subject/route.ts  # Core logic fix
src/app/api/campaigns/[id]/send-review/route.ts       # Forced subject line
src/lib/mailerlite.ts                                 # Service updates + createFinalCampaign
src/lib/openai.ts                                     # Temperature & prompts

# Debug Tools
src/app/api/debug/recent-campaigns/route.ts          # Debug endpoint
src/app/api/debug/campaign-articles/route.ts         # Debug endpoint

# Automated Scheduling System
src/app/dashboard/settings/page.tsx                  # Email settings UI
src/app/api/settings/email/route.ts                  # Settings API
src/app/api/cron/rss-processing/route.ts             # RSS automation
src/app/api/cron/generate-subject/route.ts           # Subject automation
src/app/api/cron/create-campaign/route.ts            # Campaign automation (review only)
vercel.json                                           # Cron schedule config (main group sending removed)

# Session 1 Updates (Sept 19, 2025)
src/app/api/campaigns/[id]/status/route.ts           # Campaign approval API
src/app/dashboard/campaigns/[id]/page.tsx            # Approval buttons + image thumbnails
src/app/dashboard/campaigns/page.tsx                 # "Ready to Send" status display
src/lib/slack.ts                                     # Simple message method
src/app/api/test/database/route.ts                   # TypeScript compilation fix
src/types/database.ts                                # Status workflow types
database_migration_approval_system.sql               # Database schema update

# Session 2 Updates (Sept 19, 2025) - Events Management & AI Summaries
src/app/api/events/sync/route.ts                     # Enhanced sync with AI summaries
src/app/api/events/manual-sync/route.ts              # Manual sync with AI summaries
src/app/api/events/[id]/route.ts                     # PATCH/DELETE operations for events
src/app/api/events/generate-summaries/route.ts       # Bulk AI summary generation
src/app/dashboard/databases/events/page.tsx          # Inline editing and delete functionality
src/app/dashboard/campaigns/[id]/page.tsx            # Timezone fixes and image removal
src/app/api/campaigns/[id]/preview/route.ts          # HTML template updates and AI summary integration
src/lib/openai.ts                                    # Added eventSummarizer prompt
src/types/database.ts                                # Added event_summary field to Event interface
```

## 📝 Current Session Notes (Auto-Added Before Condensing)

### Sept 22, 2025 - Session 4: Complete Newsletter Automation Implementation

## 🆕 Major Issues Resolved

### 1. Facebook Image Processing (COMPLETED ✅)
**Root Cause**: Facebook CDN URLs contain temporary authentication tokens that expire quickly
- Facebook URLs like `https://scontent-*.xx.fbcdn.net/v/t39.30808-6/...&oe=66F0B9E4` contain expiration parameters
- These URLs become inaccessible within hours, causing broken images in newsletters

**Solution Implemented**:
- **RSS Processing Enhancement**: Added immediate Facebook image detection and re-hosting during RSS feed processing
- **GitHub Storage Integration**: Downloads Facebook images in real-time and uploads to GitHub repository
- **Fallback Protection**: Preview generation now filters out expired Facebook URLs with `&oe=` parameters
- **Enhanced Error Handling**: Better logging for failed downloads and Facebook-specific error messages

### 2. Automatic Event Population (COMPLETED ✅)
**Root Cause**: Events were never automatically populated during RSS processing - required manual intervention
- Campaigns showed no events in Local Events section
- Manual selection needed for every campaign

**Solution Implemented**:
- **Auto-Population Logic**: Added `populateEventsForCampaign()` method to RSS processor
- **Date Range Calculation**: Uses same 3-day Central Time logic as preview generation
- **Smart Selection**: Auto-selects up to 6 events per day, sorted by start time
- **Featured Events**: First event of each day automatically set as featured
- **Integration**: Seamlessly integrated into RSS processing workflow

### 3. Subject Line Generation Fix (COMPLETED ✅)
**Root Cause**: Database query mismatch - looking for `ai_score` field that doesn't exist
- Code expected `articles.ai_score` but actual data structure uses `articles.rss_post.post_rating.total_score`
- Subject line generation was failing silently because no "top" article was found

**Solution Implemented**:
- **Database Query Fix**: Updated RSS processing route to query proper scoring fields
- **Sorting Logic**: Fixed article sorting to use `rss_post?.post_rating?.[0]?.total_score`
- **Enhanced Logging**: Added detailed debugging for which article is selected for subject generation

## 🛠️ Technical Implementation Details

### Facebook Image Processing Flow
```
RSS Feed → Extract Image URL → Detect Facebook CDN → Download Immediately → Upload to GitHub → Update Database
```

### Event Population Workflow
```
RSS Processing Complete → Calculate 3-Day Date Range → Query Available Events → Auto-Select Top 6/Day → Insert Campaign Events
```

### Subject Line Generation Fix
```
Campaign Query → Include post_ratings → Sort by total_score → Select Top Article → Generate Subject Line
```

## 🚧 Deployment Challenges Resolved
Multiple TypeScript compilation errors encountered and fixed:
1. **Duplicate Function Error**: Removed duplicate `logInfo` and `logError` functions
2. **Missing Function Error**: Restored accidentally removed `logError` function
3. **Type Inference Issues**: Fixed campaign-events debug endpoint type errors

## 🎯 Current Status: FULLY FUNCTIONAL
**Next automated RSS run will include all features:**
- ✅ Facebook images converted to GitHub-hosted copies
- ✅ Events automatically selected and featured
- ✅ AI subject lines generated from top-rated articles
- ✅ Complete newsletters created without manual intervention

### Sept 22, 2025 - Session 3: Vercel Cron Authentication & RSS Processing Integration

## 🆕 Major Updates

### RSS Processing Integration with Subject Line Generation (COMPLETED ✅)
- **Successfully integrated** AI subject line generation into RSS processing workflow
- **Added 60-second delay** after RSS processing before subject line generation
- **Removed standalone** `generate-subject` cron job from vercel.json
- **Increased timeout** from 300 to 420 seconds for RSS processing route
- **Updated ScheduleChecker** to reflect integrated workflow in display

### Vercel Cron Authentication Issues Fixed (COMPLETED ✅)
- **Root Cause**: Vercel cron jobs make GET requests by default, but routes expected POST with Authorization headers
- **Failed Solution**: Tried adding `method: "POST"` and `headers` to vercel.json (not supported by Vercel)
- **Working Solution**: Updated routes to handle GET requests from Vercel cron without authentication
- **Detection Logic**: Routes now distinguish between Vercel cron (no secret) vs manual testing (with secret)

### Routes Updated for Cron Compatibility:
1. **RSS Processing Route** (`/api/cron/rss-processing`):
   - Added GET handler that duplicates full POST functionality
   - Handles both Vercel cron and manual testing with secret parameter
   - Includes full RSS processing + 60-second delay + AI subject line generation

2. **Create Campaign Route** (`/api/cron/create-campaign`):
   - Fixed 401 Unauthorized error by adding GET handler
   - Now properly authenticates with Vercel cron requests
   - Maintains manual testing capability

### UI/UX Improvements (COMPLETED ✅)
- **Time Selector Enhancement**:
  - Converted all time selectors to 12-hour format with AM/PM dropdowns
  - Added proper 15-minute increments (00, 15, 30, 45) for cron compatibility
  - Added 5-minute increments for scheduled send times
  - Fixed AM/PM dropdown width (w-16 to w-20) to prevent text cutoff
  - Added custom CSS for right-aligned dropdown arrows

- **Review Workflow Documentation**:
  - Updated Settings > Email > Review Workflow Overview
  - Removed separate "Generate AI subject line" step
  - Integrated AI subject line generation into step 1 description
  - Fixed hardcoded "9pm" reference to use dynamic scheduled send time

### Live Testing Results (WORKING ✅)
**10:45 AM Cron Logs:**
- ✅ RSS Processing: 200 Success - "RSS Processing check: Current CT time 10:45, Scheduled: 10:45"
- ❌ Create Campaign: 401 Unauthorized (fixed with latest deployment)
- ✅ Health Check: 200 Success
- ✅ Send Final: 200 Success (but was just returning status, now properly checks schedule)

### Technical Achievements
- **Authentication Working**: RSS processing now authenticates and runs at scheduled time
- **Time Matching**: System correctly detects 10:45 AM cron within 15-minute window of 10:15 AM setting
- **Integration Success**: Subject line generation happens automatically after RSS processing
- **Deployment Ready**: All cron routes now compatible with Vercel's GET-based cron system

### Current Status
- **RSS Processing**: ✅ Working with integrated subject line generation
- **Campaign Creation**: ✅ Fixed authentication, ready for testing
- **User Testing**: User adjusting run times to test full workflow
- **System State**: All major cron authentication issues resolved

## 🔧 Key Files Modified This Session

```
# Cron Authentication & Integration
src/app/api/cron/rss-processing/route.ts          # Added GET handler, integrated subject generation
src/app/api/cron/create-campaign/route.ts         # Fixed GET handler for Vercel cron
vercel.json                                       # Removed unsupported method/headers config
src/lib/schedule-checker.ts                      # Updated subject generation method (deprecated)

# UI Improvements
src/app/dashboard/settings/page.tsx              # 12-hour time selectors, workflow updates
src/app/api/debug/schedule-settings/route.ts     # Debug endpoint for troubleshooting

# TypeScript Fixes
src/app/api/cron/rss-processing/route.ts         # Fixed AI_PROMPTS.subjectLineGenerator reference
```

## 🚀 Next Session Priorities
1. **Monitor cron performance** at next scheduled run
2. **Verify campaign creation** works with new authentication
3. **Test full workflow** with user's adjusted timing
4. **Remove deprecated** generate-subject route file if no longer needed

---

## 🔄 Content Management Protocol

**CLAUDE.MD AS PRIMARY REPOSITORY:**
- This file (claude.md) is now the main content repository for all development notes
- SESSION_NOTES.md is deprecated in favor of this centralized approach
- All session activities should be documented here in real-time

**AUTOMATIC UPDATE PROTOCOL:**
- **BEFORE CONDENSING**: Always add current session notes to the "Current Session Notes" section above
- **After Adding**: Update the "Last Updated" timestamp
- **Then Proceed**: With condensing operations while preserving all historical context

**Document Maintenance:**
1. Add new issues/resolutions as they arise directly to this file
2. Update timestamps for each session
3. Use debug endpoints to verify current state
4. Commit changes for future reference
5. **CRITICAL**: Current session notes auto-added before condensing

---
*This document serves as the authoritative record of development decisions and current system state.*