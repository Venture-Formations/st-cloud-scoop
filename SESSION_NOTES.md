# St. Cloud Scoop Development Session Notes

**Last Updated:** 2025-09-19 15:45 UTC
**Session Focus:** Campaign Approval System, Slack Notifications & Article Image Thumbnails

## 🔍 Current Issues Identified & Resolved

### AI Subject Line Generation Problem
- **Issue**: AI generating "Boost Community with $5K Donation" when user doesn't see $5K donation posts
- **Root Cause**: Multiple articles tied at score 21, but wrong article was being used for subject line generation
- **Campaign ID**: `0f46cbf6-ab82-4aba-ab0c-c983d659a0c2`

### Article Ranking Analysis
```
Current Campaign Articles (All Score 21):
1. "Absentee Voting Opens for Key Stearns County Elections" ← Should be used
2. "Celebrate 45 Years of Music at Red Carpet Nightclub"
3. "Celebrate Local Heroes at Central Minnesota's Safety Awards"
4. "Veterans Support Brigade Boosts Community" ← Was generating subject line
5. "Lost Border Collie Awaits Reunion" (Score: 19)
```

## ✅ Fixes Implemented

### 1. Subject Line Generation Logic (`generate-subject/route.ts`)
- **Changed**: Now uses only the highest scored article (first in sorted array)
- **Added**: Comprehensive logging to track which article is being used
- **Enhanced**: Timestamp-based prompt variation for uniqueness

### 2. OpenAI Configuration (`openai.ts`)
- **Temperature**: Increased from 0.3 to 0.8 for more creative variation
- **Creativity Rules**: Added explicit requirements for unique headline variations
- **Function**: Made temperature configurable with `callOpenAI(prompt, maxTokens, temperature)`

### 3. Send for Review Integration (`send-review/route.ts`)
- **Added**: Support for forced subject line parameter from frontend
- **Enhanced**: Detailed logging throughout the flow
- **Fixed**: MailerLite service now accepts and prioritizes forced subject line

### 4. MailerLite Service (`mailerlite.ts`)
- **Updated**: `createReviewCampaign()` method accepts optional `forcedSubjectLine` parameter
- **Prioritizes**: Forced subject line > campaign subject line > fallback

## 🛠️ Debug Tools Created

### API Endpoints
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

## 🆕 Recent Updates (Sept 19, 2025)

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

1. **Monitor**: Test approval workflow in production
2. **Verify**: Slack notifications work correctly with formatted dates
3. **Review**: Check article images display properly for RSS posts
4. **Future**: Add main group newsletter sending after review testing is complete

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

# Recent Updates (Sept 19, 2025)
src/app/api/campaigns/[id]/status/route.ts           # Campaign approval API
src/app/dashboard/campaigns/[id]/page.tsx            # Approval buttons + image thumbnails
src/app/dashboard/campaigns/page.tsx                 # "Ready to Send" status display
src/lib/slack.ts                                     # Simple message method
src/app/api/test/database/route.ts                   # TypeScript compilation fix
src/types/database.ts                                # Status workflow types
database_migration_approval_system.sql               # Database schema update
```

## 🔄 Auto-Update Instructions

**To update this document:**
1. Add new issues/resolutions as they arise
2. Update the "Last Updated" timestamp
3. Commit changes for future reference
4. Use debug endpoints to verify current state

---
*This document serves as the authoritative record of development decisions and current system state.*