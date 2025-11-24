# St. Cloud Scoop Development - Main Content Repository

**Last Updated:** 2025-10-06
**Primary Source:** Authoritative development document

## 🔒 **CURRENT SAVE POINT** (2025-10-06)
**Git Commit:** `319b36b` - Campaign deletion and AI prompt customization complete
**System State:** Fully functional with complete campaign management

**Core Features:**
- ✅ Complete RSS Processing Pipeline (auto event population, subject generation, article ranking)
- ✅ Campaign Management (Draft → In Review → Ready to Send → Sent)
- ✅ Subject Line Generation (AI + manual editing, auto-regeneration on article changes)
- ✅ Real-Time UI Updates (no page refresh required)
- ✅ Skip/Reorder Articles (with automatic subject line regeneration)
- ✅ Event Management (smart 8-event selection, featured event logic)
- ✅ Road Work Newsletter Section (AI-generated, 9 items, 3x3 grid)
- ✅ Campaign Deletion (handles 12 related tables with error tracking)
- ✅ AI Prompt Testing (purple "Test Prompt" button with realistic data)
- ✅ Custom AI Prompt Defaults (save/reset with double confirmation)
- ✅ Preview Loading States (visual feedback during generation)

## ⚠️ CRITICAL DEVELOPMENT RULES

### Confidence and Clarification Policy
**When uncertain or confidence is below 80%, always ask for clarification:**
- ❌ **NEVER** proceed with assumptions when uncertain
- ✅ **ALWAYS** ask for clarification with multiple choice options
- ✅ Present 2-4 concrete options with pros/cons

**Example Format:**
```
I'm not certain about the best approach. Here are the options:

A) Approach 1: [Description]
   Pros: [Benefits] | Cons: [Drawbacks]

B) Approach 2: [Description]
   Pros: [Benefits] | Cons: [Drawbacks]

Which would you prefer?
```

### Date/Time Handling Policy
**ALL date/time operations MUST use local (non-UTC) comparisons:**
- ❌ **NEVER** use `.toISOString()`, `.toUTCString()`, or UTC-based Date methods
- ✅ **ALWAYS** extract date strings directly: `date.split('T')[0]`
- ✅ Use string comparison on YYYY-MM-DD format without timezone conversion

**Why:** UTC conversion causes timezone shifts that break filters and comparisons.

## 🆕 Latest Session (2025-10-06): Campaign Deletion & AI Prompts

### Features Implemented

#### 1. Complete Campaign Deletion System
- **Fixed**: Missing `road_work_items` table causing foreign key violations
- **Handles 12 Tables**: campaign_events, articles, rss_posts, road_work_data, road_work_items, road_work_selections, campaign_dining_selections, campaign_vrbo_selections, user_activities, archived_articles, archived_rss_posts, newsletter_campaigns
- **Error Tracking**: Returns detailed `child_deletion_errors` showing which tables failed
- **Non-Blocking**: Child table errors don't stop overall process

#### 2. AI Prompt Testing System
- **Test Endpoint**: `/api/debug/test-ai-prompts` with realistic St. Cloud data
- **UI**: Purple "Test Prompt" button on each prompt card
- **Opens in New Tab**: Easy comparison of results

#### 3. Custom AI Prompt Defaults
- **Database**: Added `custom_default` TEXT column to `app_settings`
- **Save as Default**: Green button with double confirmation
- **Smart Reset**: Prioritizes custom defaults over code defaults
- **Migration**: `/api/debug/add-custom-default-column` endpoint

#### 4. Event Population Integration
- **Auto-Population**: Events populate during RSS processing (no manual steps)
- **Smart Selection**: Up to 8 events per day with featured event logic

### Key Files Modified
```
src/app/api/campaigns/[id]/delete/route.ts         # Campaign deletion
src/app/api/settings/ai-prompts/route.ts           # Custom defaults
src/app/api/debug/test-ai-prompts/route.ts         # Testing endpoint
src/app/dashboard/settings/page.tsx                # UI buttons
src/lib/rss-processor.ts                           # Event auto-population
```

## 🔧 Technical Configuration

### Email Settings
- **Sender**: "St. Cloud Scoop" <scoop@stcscoop.com>
- **Subject Format**: "🍦 [Subject Line]"
- **Domain**: Authenticated and verified

### AI Prompt Requirements
- **Character Limit**: ≤35 characters (room for emoji prefix)
- **Style**: Front-page newspaper headline, breaking news voice
- **Restrictions**: No colons, em dashes, year references, or "today/tomorrow"

### Content Filtering
- **Excluded**: Lost pet posts
- **Email Format**: Uses global CSS rules from `globalemailrules.txt`
- **Article Order**: Sorted by AI score (highest first)

## 🤖 Automated Newsletter Scheduling

### Schedule (Central Time)
- **8:30 PM**: Create campaign + RSS processing (`/api/cron/rss-processing`)
- **8:45 PM**: AI subject line generation (integrated into RSS processing)
- **8:50 PM**: Create review campaign (`/api/cron/create-campaign`)
- **9:00 PM**: MailerLite sends to review group

### Settings Page
- Configurable scheduling times (12-hour format with AM/PM)
- MailerLite settings (Review Group ID, From Email, Sender Name)
- Times stored in `app_settings` table

## 🛠️ Debug Tools

### Key Endpoints
- `/api/debug/recent-campaigns` - Lists recent campaigns
- `/api/debug/campaign-articles?campaign_id=X` - Shows campaign articles
- `/api/debug/check-events` - Verifies events availability
- `/api/debug/test-subject-generation` - Tests subject line generation
- `/api/debug/test-ai-prompts` - Tests AI prompts with realistic data
- `/api/debug/check-campaign-relations` - Diagnoses campaign relationships

### Production URLs
- Base: `https://st-cloud-scoop.vercel.app`
- Debug: `https://st-cloud-scoop.vercel.app/api/debug/recent-campaigns`

## 📋 Historical Context (Condensed)

### Major Issues Resolved
1. **Events Not Populating**: Fixed by moving event population to start of RSS processing
2. **Subject Line Generation Failing**: Fixed AI response format from JSON to plain text
3. **Facebook Images Expiring**: Added GitHub re-hosting during RSS processing
4. **Campaign Deletion Errors**: Fixed by including all 12 related tables
5. **Vercel Cron Authentication**: Updated routes to handle GET requests

### RSS Processing Evolution
- **Original**: Events at end (timed out), 60-second delays
- **Current**: Events first, subject generation after top 5 articles activated, 12-min timeout
- **Integration**: Facebook image re-hosting, event auto-population, subject generation all automated

### Subject Line Auto-Regeneration
- **Triggers**: Skip #1 article OR reorder changing #1 position
- **Smart Detection**: Only regenerates when effective #1 article changes
- **Real-Time UI**: Updates instantly without page refresh
- **Database**: Added `skipped` boolean field to articles table

### Road Work Section
- **AI Generation**: 9 road work items for St. Cloud area (15-mile radius)
- **Layout**: 3x3 grid, email-compatible HTML
- **Database**: `road_work_data` table with JSONB storage
- **Automation**: Daily 7PM CT generation via Vercel cron
- **Critical Fix**: Newsletter footer now properly closes container divs

### Events Management Overhaul
- **Sync**: Fixed pagination to get all events (62 vs 50)
- **HTML Entity Decoding**: Converted encoded characters
- **CRUD**: Full edit/delete functionality
- **Timezone**: Fixed Central Time alignment
- **AI Summaries**: Added `event_summary` column with 50-word AI descriptions

## 📁 Core Files Reference

### Key Routes
```
src/app/api/campaigns/[id]/preview/route.ts          # Newsletter generation
src/app/api/campaigns/[id]/generate-subject/route.ts # Subject line AI
src/app/api/campaigns/[id]/send-review/route.ts      # Review campaign creation
src/app/api/campaigns/[id]/delete/route.ts           # Campaign deletion
src/app/api/cron/rss-processing/route.ts             # Main automation
src/app/api/cron/create-campaign/route.ts            # Campaign creation
src/app/api/cron/generate-road-work/route.ts         # Road work generation
```

### Core Libraries
```
src/lib/rss-processor.ts                # RSS processing + event population
src/lib/subject-line-generator.ts       # Shared subject line logic
src/lib/road-work-manager.ts            # Road work generation
src/lib/mailerlite.ts                   # Email service integration
src/lib/openai.ts                       # AI prompts and generation
src/lib/slack.ts                        # Notification system
```

### UI Components
```
src/app/dashboard/campaigns/[id]/page.tsx  # Campaign detail page
src/app/dashboard/campaigns/page.tsx       # Campaign list
src/app/dashboard/settings/page.tsx        # Settings with AI prompts
src/app/dashboard/databases/events/page.tsx # Events management
```

### Database Types
```
src/types/database.ts                   # All TypeScript interfaces
```

## 🔄 Content Management Protocol

**CLAUDE.MD AS PRIMARY REPOSITORY:**
- This file is the main repository for all development notes
- All session activities documented here in real-time

**AUTOMATIC UPDATE PROTOCOL:**
1. Add new issues/resolutions as they arise
2. Update "Last Updated" timestamp
3. Use debug endpoints to verify state
4. Commit changes for future reference

**Document Maintenance:**
- Keep latest save point detailed
- Condense older sessions into "Historical Context"
- Preserve critical rules and configurations
- Remove verbose examples and duplicate information

---
*This document serves as the authoritative record of development decisions and current system state.*
