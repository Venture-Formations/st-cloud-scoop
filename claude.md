# St. Cloud Scoop Development - Main Content Repository

**Last Updated:** 2025-11-24
**Primary Source:** Authoritative development document

## 🔒 **CURRENT SAVE POINT** (2025-11-24)
**Git Commit:** `10fdb37` - Newsletter archiving system complete with all sections
**System State:** Fully functional with automated newsletter archiving

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
- ✅ Newsletter Archiving System (automatic archiving on send with all sections)
- ✅ Public Newsletter Archive (matches email layout with responsive design)

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

## 🆕 Latest Session (2025-11-24): Newsletter Archiving System

### Features Implemented

#### 1. Automated Newsletter Archiving
- **Integration**: Added archiving to both automated send endpoints (`send-newsletter` and `send-final`)
- **Non-Blocking**: Archiving errors don't prevent newsletter from sending
- **Complete Data**: Archives capture all newsletter sections in single JSONB structure
- **Logging**: Detailed console logs for debugging archiving process

#### 2. Complete Section Data Collection
- **Articles**: With direct `image_url` field for performance (70-82 in archiver)
- **Events**: Grouped by date with featured status (93-126)
- **Wordle**: Yesterday's puzzle with definition and fact (129-139)
- **Poll**: Active poll with all options (141-147)
- **Minnesota Getaways**: VRBO properties with images (149-160)
- **Dining Deals**: Restaurant deals by day of week (162-173)
- **Weather**: HTML forecast data (175-180)
- **Road Work**: 3x3 grid of road work items (182-188)
- **Business Spotlight**: Featured local business (190-199)
- **Metadata**: Flags for section availability (238-250)

#### 3. Public Newsletter Archive Pages
- **Archive List**: `/newsletter` page with newsletter grid, pagination, and preview images (74-96 in page.tsx)
- **Archive Detail**: `/newsletter/[date]` page matching email layout
  - Article images to right of content (266-322 in [date]/page.tsx)
  - 3-column responsive events grid grouped by date (324-390)
  - Featured event badges with styling
  - All newsletter sections with correct names
  - Newsletter color scheme (#1877F2)
  - Next.js Image optimization
  - Mobile-responsive design

#### 4. Manual Archive Management
- **Manual Archive**: `/api/debug/manual-archive` endpoint for archiving past campaigns
- **Delete Archive**: `/api/debug/delete-archive` endpoint for re-archiving with updated data
- **Scripts**: `scripts/archive-campaigns.ts` for batch archiving

### Critical Fixes

#### TypeScript null vs undefined (Line 88 in archiver)
- **Error**: `Type 'null' is not assignable to type '{ title?: string | undefined; ... } | undefined'`
- **Fix**: Changed `rss_post: rssPostData ? {...} : null` to `rss_post: rssPostData ? {...} : undefined`

#### newsletter_id Column Missing
- **Error**: `column newsletter_campaigns.newsletter_id does not exist`
- **Fix**: Hardcoded newsletter_id to 'stcscoop' and removed column from query (28-32 in archiver)

### Key Files Modified
```
src/app/api/cron/send-newsletter/route.ts          # Added archiving (116-135)
src/app/api/cron/send-final/route.ts               # Added archiving (171-190)
src/lib/newsletter-archiver.ts                     # Complete overhaul (129-236)
src/app/newsletter/[date]/page.tsx                 # Complete rewrite (645 lines)
src/app/newsletter/page.tsx                        # Archive list page (74-96)
src/app/api/debug/manual-archive/route.ts          # New file
src/app/api/debug/delete-archive/route.ts          # New file
scripts/archive-campaigns.ts                       # New file
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
- `/api/debug/manual-archive?campaign_id=X` - Manually archive a campaign
- `/api/debug/delete-archive?campaign_id=X` - Delete an archived newsletter

### Production URLs
- Base: `https://st-cloud-scoop.vercel.app`
- Debug: `https://st-cloud-scoop.vercel.app/api/debug/recent-campaigns`

## 📋 Historical Context (Condensed)

### Session 2025-10-06: Campaign Deletion & AI Prompts
- **Campaign Deletion**: Fixed missing `road_work_items` table causing foreign key violations. Now handles 12 related tables with error tracking.
- **AI Prompt Testing**: Added `/api/debug/test-ai-prompts` endpoint with purple "Test Prompt" button in UI
- **Custom AI Prompt Defaults**: Added `custom_default` column to `app_settings` with save/reset functionality
- **Event Population**: Integrated auto-population during RSS processing (no manual steps needed)

### Major Issues Resolved
1. **Events Not Populating**: Fixed by moving event population to start of RSS processing
2. **Subject Line Generation Failing**: Fixed AI response format from JSON to plain text
3. **Facebook Images Expiring**: Added GitHub re-hosting during RSS processing
4. **Campaign Deletion Errors**: Fixed by including all 12 related tables
5. **Vercel Cron Authentication**: Updated routes to handle GET requests
6. **Newsletter Archives Missing**: Added archiving to send endpoints with all section data

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
src/app/api/cron/send-newsletter/route.ts            # Automated send (with archiving)
src/app/api/cron/send-final/route.ts                 # Final send (with archiving)
src/app/api/debug/manual-archive/route.ts            # Manual newsletter archiving
src/app/api/debug/delete-archive/route.ts            # Delete archived newsletter
src/app/api/newsletters/archived/route.ts            # Fetch archived newsletters list
```

### Core Libraries
```
src/lib/rss-processor.ts                # RSS processing + event population
src/lib/subject-line-generator.ts       # Shared subject line logic
src/lib/road-work-manager.ts            # Road work generation
src/lib/newsletter-archiver.ts          # Newsletter archiving service
src/lib/mailerlite.ts                   # Email service integration
src/lib/openai.ts                       # AI prompts and generation
src/lib/slack.ts                        # Notification system
```

### UI Components
```
src/app/dashboard/campaigns/[id]/page.tsx   # Campaign detail page
src/app/dashboard/campaigns/page.tsx        # Campaign list
src/app/dashboard/settings/page.tsx         # Settings with AI prompts
src/app/dashboard/databases/events/page.tsx # Events management
src/app/newsletter/page.tsx                 # Public newsletter archive list
src/app/newsletter/[date]/page.tsx          # Public newsletter archive detail
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
