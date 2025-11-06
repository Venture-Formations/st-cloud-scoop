# Building Accounting AI Newsletter from St. Cloud Scoop

**Created:** 2025-10-13
**Source Project:** C:\Users\dpenn\Documents\STC_Scoop
**Target:** New multi-tenant AI Professional Newsletter Platform
**Timeline:** 5 days (Test email by 2025-10-17)

---

## 📋 Complete Build Checklist

Copy this entire document into Claude Code in your NEW project directory once created.

---

## Phase 1: Project Setup & Database (Day 1 - 2-3 hours)

### Step 1.1: Create New Project Directory

```bash
# Navigate to your Documents folder
cd C:\Users\dpenn\Documents

# Create new project directory
mkdir AI_Pros_Newsletter
cd AI_Pros_Newsletter

# Copy all files from St. Cloud Scoop
xcopy "C:\Users\dpenn\Documents\STC_Scoop\*" . /E /H /I

# Initialize new git repository
git init
git add .
git commit -m "Initial commit: Forked from St. Cloud Scoop for AI Professional Newsletters"
```

### Step 1.2: Create New Supabase Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Project Name: `AI Professional Newsletters`
4. Database Password: (generate strong password and save)
5. Region: (choose closest to you)
6. Wait for project provisioning (~2 minutes)

### Step 1.3: Run Database Schema Setup

Open Supabase SQL Editor and run these scripts in order:

#### Script 1: Core Multi-Tenant Tables

```sql
-- Already exists from St. Cloud Scoop, but verify structure
SELECT * FROM newsletters LIMIT 1;
SELECT * FROM newsletter_settings LIMIT 1;
SELECT * FROM newsletter_sections LIMIT 1;

-- If newsletters table doesn't have proper structure, create it
CREATE TABLE IF NOT EXISTS newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  subdomain TEXT UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Accounting newsletter
INSERT INTO newsletters (name, slug, subdomain, description, is_active)
VALUES (
  'Accounting AI Daily',
  'accounting',
  'accounting',
  'Daily AI tools, applications, and prompts for accounting professionals',
  true
)
ON CONFLICT (slug) DO NOTHING;
```

#### Script 2: AI Applications Table

```sql
CREATE TABLE ai_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id UUID NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,

  -- Application Details
  app_name TEXT NOT NULL,
  tagline TEXT, -- Short one-liner (max 80 chars)
  description TEXT NOT NULL, -- Full description (max 200 chars)
  category TEXT, -- e.g., "Automation", "Analysis", "Writing", "Research"

  -- Links & Images
  app_url TEXT NOT NULL, -- Direct link to application
  tracked_link TEXT, -- MailerLite tracked link
  logo_url TEXT, -- Optional app logo/icon
  screenshot_url TEXT, -- Optional screenshot

  -- Metadata
  pricing TEXT, -- "Free", "Freemium", "Paid", "$X/mo"
  is_featured BOOLEAN DEFAULT false,
  is_paid_placement BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  -- Display & Rotation
  display_order INT,
  last_used_date DATE,
  times_used INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_apps_newsletter ON ai_applications(newsletter_id);
CREATE INDEX idx_ai_apps_active ON ai_applications(is_active);
CREATE INDEX idx_ai_apps_category ON ai_applications(category);
```

#### Script 3: Campaign AI App Selections Table

```sql
CREATE TABLE campaign_ai_app_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES ai_applications(id) ON DELETE CASCADE,
  selection_order INT NOT NULL, -- 1-5 for display position
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(campaign_id, app_id),
  UNIQUE(campaign_id, selection_order)
);

CREATE INDEX idx_campaign_apps_campaign ON campaign_ai_app_selections(campaign_id);
```

#### Script 4: Prompt Ideas Table

```sql
CREATE TABLE prompt_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id UUID NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,

  -- Prompt Details
  title TEXT NOT NULL, -- e.g., "Analyze Cash Flow Trends"
  prompt_text TEXT NOT NULL, -- Full prompt template (max 500 chars)
  category TEXT, -- e.g., "Financial Analysis", "Client Communication", "Reporting"
  use_case TEXT, -- Brief explanation of when to use (max 150 chars)

  -- AI Model Suggestions
  suggested_model TEXT, -- e.g., "ChatGPT", "Claude", "Gemini", "Any"

  -- Metadata
  difficulty_level TEXT, -- "Beginner", "Intermediate", "Advanced"
  estimated_time TEXT, -- e.g., "2 minutes", "5 minutes"
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  -- Display & Rotation
  display_order INT,
  last_used_date DATE,
  times_used INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prompt_ideas_newsletter ON prompt_ideas(newsletter_id);
CREATE INDEX idx_prompt_ideas_active ON prompt_ideas(is_active);
CREATE INDEX idx_prompt_ideas_category ON prompt_ideas(category);
```

#### Script 5: Campaign Prompt Selections Table

```sql
CREATE TABLE campaign_prompt_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  prompt_id UUID NOT NULL REFERENCES prompt_ideas(id) ON DELETE CASCADE,
  selection_order INT NOT NULL, -- 1-5 for display position
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(campaign_id, prompt_id),
  UNIQUE(campaign_id, selection_order)
);

CREATE INDEX idx_campaign_prompts_campaign ON campaign_prompt_selections(campaign_id);
```

#### Script 6: Update Newsletter Sections

```sql
-- Insert new sections for Accounting newsletter
INSERT INTO newsletter_sections (newsletter_id, name, display_order, is_active) VALUES
((SELECT id FROM newsletters WHERE slug = 'accounting'), 'Welcome', 1, true),
((SELECT id FROM newsletters WHERE slug = 'accounting'), 'Advertisement', 2, true),
((SELECT id FROM newsletters WHERE slug = 'accounting'), 'Top Articles', 3, true),
((SELECT id FROM newsletters WHERE slug = 'accounting'), 'AI Applications', 4, true),
((SELECT id FROM newsletters WHERE slug = 'accounting'), 'Bottom Articles', 5, true),
((SELECT id FROM newsletters WHERE slug = 'accounting'), 'Prompt Ideas', 6, true)
ON CONFLICT DO NOTHING;
```

#### Script 7: Sample Data - AI Applications

```sql
-- Get newsletter_id for accounting
DO $$
DECLARE
  accounting_newsletter_id UUID;
BEGIN
  SELECT id INTO accounting_newsletter_id FROM newsletters WHERE slug = 'accounting';

  -- Insert sample AI applications
  INSERT INTO ai_applications (newsletter_id, app_name, tagline, description, category, app_url, pricing, is_active) VALUES
  (accounting_newsletter_id, 'QuickBooks AI Assistant', 'Automate your bookkeeping with AI', 'AI-powered accounting assistant that categorizes transactions, detects anomalies, and generates financial reports automatically.', 'Automation', 'https://quickbooks.intuit.com/ai', 'Freemium', true),

  (accounting_newsletter_id, 'Fathom AI', 'Analyze financial statements in seconds', 'Upload financial statements and get instant AI-powered analysis with key insights, trends, and actionable recommendations.', 'Analysis', 'https://www.fathomhq.com/', 'Paid', true),

  (accounting_newsletter_id, 'Vic.ai', 'Autonomous invoice processing', 'AI that learns your GL codes and processes invoices automatically with 99.5% accuracy, eliminating manual data entry.', 'Automation', 'https://www.vic.ai/', 'Enterprise', true),

  (accounting_newsletter_id, 'ChatGPT Accountant', 'Your AI accounting consultant', 'Specialized GPT trained on accounting standards, tax regulations, and best practices. Ask complex accounting questions and get expert-level responses.', 'Research', 'https://chat.openai.com/g/g-accountant', 'Free', true),

  (accounting_newsletter_id, 'MindBridge AI', 'Audit risk assessment platform', 'AI-powered audit analytics that identifies financial anomalies, risk areas, and potential fraud in minutes instead of weeks.', 'Analysis', 'https://www.mindbridge.ai/', 'Enterprise', true),

  (accounting_newsletter_id, 'Booke.AI', 'AI bookkeeping automation', 'Automates month-end close, categorization, and reconciliation. Integrates with QuickBooks and Xero for seamless workflows.', 'Automation', 'https://www.booke.ai/', 'Freemium', true),

  (accounting_newsletter_id, 'Docyt', 'Real-time accounting AI', 'AI back-office that processes receipts, bills, and transactions in real-time with automated categorization and approval workflows.', 'Automation', 'https://www.docyt.com/', 'Paid', true),

  (accounting_newsletter_id, 'Puzzle AI', 'Startup CFO copilot', 'AI-powered financial management platform for startups. Handles bookkeeping, forecasting, and financial reporting automatically.', 'Analysis', 'https://www.puzzlefinancial.com/', 'Paid', true),

  (accounting_newsletter_id, 'Claude for Accountants', 'AI writing assistant for CPAs', 'Generate client emails, explanation letters, and financial summaries using Claude''s advanced language understanding tailored for accounting.', 'Writing', 'https://claude.ai/', 'Freemium', true),

  (accounting_newsletter_id, 'FloQast AI', 'Close management automation', 'AI-powered month-end close software that automates reconciliations, checklist management, and team collaboration for accounting teams.', 'Automation', 'https://www.floqast.com/', 'Enterprise', true);
END $$;
```

#### Script 8: Sample Data - Prompt Ideas

```sql
-- Get newsletter_id for accounting
DO $$
DECLARE
  accounting_newsletter_id UUID;
BEGIN
  SELECT id INTO accounting_newsletter_id FROM newsletters WHERE slug = 'accounting';

  -- Insert sample prompt ideas
  INSERT INTO prompt_ideas (newsletter_id, title, prompt_text, category, use_case, suggested_model, difficulty_level, is_active) VALUES

  (accounting_newsletter_id, 'Analyze Monthly Cash Flow', 'Review the following cash flow data from [Month]: [paste data]. Identify trends, potential issues, and provide 3 actionable recommendations to improve cash flow in the next quarter.', 'Financial Analysis', 'Use when reviewing monthly financials with clients to quickly identify key insights.', 'ChatGPT', 'Beginner', true),

  (accounting_newsletter_id, 'Draft Tax Deadline Reminder Email', 'Write a professional email to clients reminding them of the [Tax Deadline Date] deadline. Include: 1) Required documents, 2) Consequences of missing deadline, 3) How to schedule appointment. Tone: Professional but friendly.', 'Client Communication', 'Save time during tax season by generating personalized reminder emails.', 'Claude', 'Beginner', true),

  (accounting_newsletter_id, 'Explain Complex Tax Rule', 'I need to explain [Tax Rule or Regulation] to a client in simple terms. Create a 2-3 paragraph explanation that avoids jargon and includes a real-world example of how this affects their business.', 'Client Communication', 'Help clients understand complex tax topics without overwhelming them.', 'Claude', 'Intermediate', true),

  (accounting_newsletter_id, 'Generate GL Code Descriptions', 'Here are my general ledger account codes: [paste GL codes]. For each code, generate a clear 1-2 sentence description that my team can use when categorizing transactions. Make descriptions specific and actionable.', 'Documentation', 'Standardize GL code usage across your accounting team.', 'ChatGPT', 'Beginner', true),

  (accounting_newsletter_id, 'Create Financial Ratio Analysis', 'Using these financial statements [paste data], calculate and analyze the following ratios: Current Ratio, Quick Ratio, Debt-to-Equity, ROA, and ROE. Explain what each ratio means for this business and flag any concerning trends.', 'Financial Analysis', 'Generate comprehensive ratio analysis reports for client presentations.', 'ChatGPT', 'Advanced', true),

  (accounting_newsletter_id, 'Write Audit Findings Summary', 'I found the following issues during my audit: [list findings]. Create a professional summary document that explains each finding, its impact, and recommended corrective actions. Tone: Constructive and solution-focused.', 'Documentation', 'Transform raw audit notes into polished client deliverables.', 'Claude', 'Intermediate', true),

  (accounting_newsletter_id, 'Build Excel Formula for Complex Calculation', 'I need an Excel formula that: [describe calculation logic]. Provide the formula with clear explanations of each component and any helper columns needed. Include example values to verify accuracy.', 'Automation', 'Create complex Excel formulas without hours of trial and error.', 'ChatGPT', 'Intermediate', true),

  (accounting_newsletter_id, 'Summarize New Accounting Standard', 'Summarize ASC [Standard Number] in 5 bullet points. Focus on: 1) What changed, 2) Who it affects, 3) Effective dates, 4) Key implementation steps, 5) Common pitfalls to avoid.', 'Research', 'Stay current on accounting standards without reading 100-page documents.', 'Claude', 'Advanced', true),

  (accounting_newsletter_id, 'Draft Collections Email Sequence', 'Create a 3-email sequence for collecting overdue invoices: Email 1 (15 days overdue - friendly reminder), Email 2 (30 days - firmer tone), Email 3 (45 days - final notice). Keep professional but progressively direct.', 'Client Communication', 'Automate collections communication while maintaining relationships.', 'Claude', 'Beginner', true),

  (accounting_newsletter_id, 'Analyze Expense Variances', 'Compare these two periods of expense data: [Period 1] vs [Period 2]. Identify the top 5 variances by dollar amount and percentage. For each variance, suggest 2-3 possible explanations and questions to investigate.', 'Financial Analysis', 'Quickly identify and explain budget variances for management reports.', 'ChatGPT', 'Intermediate', true);
END $$;
```

#### Script 9: Newsletter Settings for MailerLite

```sql
-- Insert MailerLite settings (update with your actual values after setting up MailerLite)
DO $$
DECLARE
  accounting_newsletter_id UUID;
BEGIN
  SELECT id INTO accounting_newsletter_id FROM newsletters WHERE slug = 'accounting';

  INSERT INTO newsletter_settings (newsletter_id, key, value, description) VALUES
  (accounting_newsletter_id, 'mailerlite_test_group_id', 'YOUR_TEST_GROUP_ID', 'MailerLite test group ID for Accounting newsletter'),
  (accounting_newsletter_id, 'mailerlite_main_group_id', 'YOUR_MAIN_GROUP_ID', 'MailerLite production group ID for Accounting newsletter'),
  (accounting_newsletter_id, 'from_email', 'accounting@yourdomain.com', 'Email sender address'),
  (accounting_newsletter_id, 'sender_name', 'Accounting AI Daily', 'Email sender name'),
  (accounting_newsletter_id, 'rss_processing_time', '20:30', 'Time to run RSS processing (CT)'),
  (accounting_newsletter_id, 'campaign_creation_time', '20:50', 'Time to create review campaign (CT)'),
  (accounting_newsletter_id, 'scheduled_send_time', '21:00', 'Time to send review campaign (CT)')
  ON CONFLICT DO NOTHING;
END $$;
```

### Step 1.4: Update Environment Variables

Edit `.env.local`:

```bash
# Supabase - NEW PROJECT CREDENTIALS
NEXT_PUBLIC_SUPABASE_URL=https://your-new-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-new-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key

# Keep existing from St. Cloud Scoop
OPENAI_API_KEY=your-openai-key
MAILERLITE_API_KEY=your-mailerlite-key
SLACK_WEBHOOK_URL=your-slack-webhook

# Vercel Cron Secret (generate new)
CRON_SECRET=your-new-random-secret
```

### Step 1.5: Test Local Build

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Verify site loads at http://localhost:3000
# Should see St. Cloud Scoop dashboard (we'll update branding next)
```

---

## Phase 2: Core Code Modifications (Day 2 - 4-5 hours)

### Step 2.1: Update TypeScript Types

File: `src/types/database.ts`

Add these new interfaces:

```typescript
// Add to existing types
export interface AIApplication {
  id: string
  newsletter_id: string
  app_name: string
  tagline: string | null
  description: string
  category: string | null
  app_url: string
  tracked_link: string | null
  logo_url: string | null
  screenshot_url: string | null
  pricing: string | null
  is_featured: boolean
  is_paid_placement: boolean
  is_active: boolean
  display_order: number | null
  last_used_date: string | null
  times_used: number
  created_at: string
  updated_at: string
}

export interface CampaignAIAppSelection {
  id: string
  campaign_id: string
  app_id: string
  selection_order: number
  is_featured: boolean
  created_at: string
  ai_application?: AIApplication
}

export interface PromptIdea {
  id: string
  newsletter_id: string
  title: string
  prompt_text: string
  category: string | null
  use_case: string | null
  suggested_model: string | null
  difficulty_level: string | null
  estimated_time: string | null
  is_featured: boolean
  is_active: boolean
  display_order: number | null
  last_used_date: string | null
  times_used: number
  created_at: string
  updated_at: string
}

export interface CampaignPromptSelection {
  id: string
  campaign_id: string
  prompt_id: string
  selection_order: number
  is_featured: boolean
  created_at: string
  prompt_idea?: PromptIdea
}
```

### Step 2.2: Create Newsletter Generators Library

Create folder: `src/lib/newsletter-generators/`

#### File: `src/lib/newsletter-generators/welcome-section.ts`

```typescript
import { Article } from '@/types/database'

export function generateWelcomeSection(articles: Article[]): string {
  const articleTitles = articles
    .slice(0, 6)
    .map((article) => `
      <li style="margin-bottom: 8px; color: #374151; font-size: 15px;">
        <strong>${article.headline}</strong>
      </li>
    `)
    .join('')

  return `
    <div style="background-color: #F9FAFB; padding: 24px; border-radius: 8px; margin-bottom: 32px;">
      <h2 style="color: #1F2937; font-size: 20px; font-weight: 600; margin-bottom: 16px;">
        📬 In Today's Newsletter
      </h2>
      <ul style="list-style: none; padding-left: 0; margin: 0;">
        ${articleTitles}
      </ul>
    </div>
  `
}
```

#### File: `src/lib/newsletter-generators/ai-apps-section.ts`

```typescript
import { AIApplication } from '@/types/database'

export function generateAIAppsSection(apps: AIApplication[]): string {
  const appCards = apps.map((app) => `
    <div style="background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
      <div style="display: flex; align-items: start; gap: 16px;">
        ${app.logo_url ? `
          <img src="${app.logo_url}" alt="${app.app_name}" style="width: 48px; height: 48px; border-radius: 8px;" />
        ` : ''}

        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <h3 style="color: #1F2937; font-size: 18px; font-weight: 600; margin: 0;">
              ${app.app_name}
            </h3>
            <span style="background-color: #EEF2FF; color: #4F46E5; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500;">
              ${app.pricing || 'Free'}
            </span>
          </div>

          ${app.tagline ? `
            <p style="color: #6B7280; font-size: 14px; font-style: italic; margin: 0 0 8px 0;">
              ${app.tagline}
            </p>
          ` : ''}

          <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">
            ${app.description}
          </p>

          <div style="display: flex; gap: 12px; align-items: center;">
            <a href="${app.tracked_link || app.app_url}"
               style="background-color: #3B82F6; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
              Try ${app.app_name} →
            </a>
            ${app.category ? `
              <span style="color: #9CA3AF; font-size: 13px;">
                ${app.category}
              </span>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('')

  return `
    <div style="margin-bottom: 48px;">
      <h2 style="color: #1F2937; font-size: 24px; font-weight: 700; margin-bottom: 24px; border-bottom: 2px solid #3B82F6; padding-bottom: 12px;">
        🤖 AI Tools for Accountants
      </h2>
      ${appCards}
    </div>
  `
}
```

#### File: `src/lib/newsletter-generators/prompt-ideas-section.ts`

```typescript
import { PromptIdea } from '@/types/database'

export function generatePromptIdeasSection(prompts: PromptIdea[]): string {
  const promptCards = prompts.map((prompt, index) => `
    <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; margin-bottom: 20px; border-radius: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
        <h3 style="color: #92400E; font-size: 18px; font-weight: 600; margin: 0;">
          ${index + 1}. ${prompt.title}
        </h3>
        ${prompt.difficulty_level ? `
          <span style="background-color: #FCD34D; color: #78350F; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 500;">
            ${prompt.difficulty_level}
          </span>
        ` : ''}
      </div>

      ${prompt.use_case ? `
        <p style="color: #78350F; font-size: 14px; margin: 0 0 12px 0; font-style: italic;">
          ${prompt.use_case}
        </p>
      ` : ''}

      <div style="background-color: #FFFBEB; padding: 16px; border-radius: 6px; margin-bottom: 12px;">
        <code style="color: #92400E; font-size: 14px; line-height: 1.6; white-space: pre-wrap; font-family: 'Courier New', monospace;">${prompt.prompt_text}</code>
      </div>

      <div style="display: flex; gap: 8px; align-items: center;">
        ${prompt.suggested_model ? `
          <span style="color: #92400E; font-size: 13px;">
            💬 Best for: <strong>${prompt.suggested_model}</strong>
          </span>
        ` : ''}
        ${prompt.category ? `
          <span style="color: #B45309; font-size: 13px;">
            • ${prompt.category}
          </span>
        ` : ''}
      </div>
    </div>
  `).join('')

  return `
    <div style="margin-bottom: 48px;">
      <h2 style="color: #1F2937; font-size: 24px; font-weight: 700; margin-bottom: 24px; border-bottom: 2px solid #F59E0B; padding-bottom: 12px;">
        💡 AI Prompts to Try This Week
      </h2>
      <p style="color: #6B7280; font-size: 15px; margin-bottom: 24px;">
        Copy and paste these prompts into ChatGPT, Claude, or your favorite AI assistant to save time and improve accuracy.
      </p>
      ${promptCards}
    </div>
  `
}
```

#### File: `src/lib/newsletter-generators/index.ts`

```typescript
export { generateWelcomeSection } from './welcome-section'
export { generateAIAppsSection } from './ai-apps-section'
export { generatePromptIdeasSection } from './prompt-ideas-section'
```

### Step 2.3: Create API Routes for AI Applications

#### File: `src/app/api/ai-apps/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const newsletterId = searchParams.get('newsletter_id')

    const supabase = createClient()

    const query = supabase
      .from('ai_applications')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (newsletterId) {
      query.eq('newsletter_id', newsletterId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ apps: data })
  } catch (error: any) {
    console.error('Error fetching AI applications:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = createClient()

    const { data, error } = await supabase
      .from('ai_applications')
      .insert(body)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ app: data })
  } catch (error: any) {
    console.error('Error creating AI application:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
```

#### File: `src/app/api/ai-apps/[id]/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const updates = await request.json()
    const supabase = createClient()

    const { data, error } = await supabase
      .from('ai_applications')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ app: data })
  } catch (error: any) {
    console.error('Error updating AI application:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createClient()

    const { error } = await supabase
      .from('ai_applications')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting AI application:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
```

### Step 2.4: Create API Routes for Prompt Ideas

#### File: `src/app/api/prompt-ideas/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const newsletterId = searchParams.get('newsletter_id')

    const supabase = createClient()

    const query = supabase
      .from('prompt_ideas')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (newsletterId) {
      query.eq('newsletter_id', newsletterId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ prompts: data })
  } catch (error: any) {
    console.error('Error fetching prompt ideas:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = createClient()

    const { data, error } = await supabase
      .from('prompt_ideas')
      .insert(body)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ prompt: data })
  } catch (error: any) {
    console.error('Error creating prompt idea:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
```

#### File: `src/app/api/prompt-ideas/[id]/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const updates = await request.json()
    const supabase = createClient()

    const { data, error } = await supabase
      .from('prompt_ideas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ prompt: data })
  } catch (error: any) {
    console.error('Error updating prompt idea:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createClient()

    const { error } = await supabase
      .from('prompt_ideas')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting prompt idea:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
```

---

## Phase 3: Database Management Pages (Day 3 - 5-6 hours)

### Step 3.1: Create AI Applications Management Page

#### File: `src/app/dashboard/databases/ai-apps/page.tsx`

This file will be ~500 lines. Ask Claude Code to generate it based on the existing events management page pattern.

Key features:
- List all AI applications with edit/delete
- Add new application form
- Filter by category
- Mark as featured
- Track usage stats

### Step 3.2: Create Prompt Ideas Management Page

#### File: `src/app/dashboard/databases/prompt-ideas/page.tsx`

Similar to AI apps page. Key features:
- List all prompts with edit/delete
- Add new prompt form
- Filter by category and difficulty
- Preview prompt text
- Track usage stats

---

## Phase 4: Newsletter Preview Generation (Day 4 - 4-5 hours)

### Step 4.1: Modify Campaign Preview Route

File: `src/app/api/campaigns/[id]/preview/route.ts`

Major changes needed:
1. Import new section generators
2. Query AI apps and prompts for campaign
3. Split articles into top 3 and bottom 3
4. Insert new sections in correct order
5. Remove old Events/Road Work sections

Ask Claude Code: "Update the campaign preview route to use the new 6-section layout for accounting newsletter"

### Step 4.2: Update Article Selection Logic

File: `src/lib/rss-processor.ts`

Change from activating top 5 articles to top 6 articles.

Find this logic:
```typescript
// Activate top 5 articles
const topArticles = rankedArticles.slice(0, 5)
```

Change to:
```typescript
// Activate top 6 articles for AI newsletter layout
const topArticles = rankedArticles.slice(0, 6)
```

### Step 4.3: Create Campaign Selection APIs

#### File: `src/app/api/campaigns/[id]/ai-apps/route.ts`

Handles selecting 5 AI apps for a specific campaign.

#### File: `src/app/api/campaigns/[id]/prompt-ideas/route.ts`

Handles selecting 3-5 prompts for a specific campaign.

Both should include:
- GET: Fetch current selections
- POST: Save new selections
- Rotation logic to avoid repeating same content

---

## Phase 5: Testing & Deployment (Day 5 - 3-4 hours)

### Step 5.1: Local Testing Checklist

```bash
# Run development server
npm run dev

# Test these workflows:
# 1. Add new AI application in database page
# 2. Add new prompt idea in database page
# 3. Create test campaign
# 4. Preview newsletter - verify all 6 sections appear
# 5. Check that articles split correctly (3 + 3)
# 6. Verify welcome section shows article titles
```

### Step 5.2: Deploy to Vercel

```bash
# Push to GitHub
git add .
git commit -m "Initial AI Professional Newsletter implementation"
git push origin main

# Deploy to Vercel
# 1. Go to vercel.com
# 2. Import Git Repository
# 3. Select your GitHub repo
# 4. Add environment variables from .env.local
# 5. Deploy
```

### Step 5.3: MailerLite Setup

1. Create test group: "Accounting AI Daily (Test)"
2. Add 2-3 test email addresses
3. Verify sender email
4. Update newsletter_settings with group ID
5. Create first test campaign
6. Send test email

---

## 🎯 Success Criteria

By end of Friday (2025-10-17):

✅ Database fully populated with 10+ AI apps and 10+ prompts
✅ Newsletter preview generates correctly with all 6 sections
✅ Test email sent and rendered correctly
✅ All sections display properly on desktop and mobile
✅ No broken images or layout issues

---

## 🆘 Troubleshooting Guide

### Issue: TypeScript Errors

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Run type check
npx tsc --noEmit
```

### Issue: Supabase Connection Errors

1. Verify environment variables in `.env.local`
2. Check Supabase project is not paused
3. Verify RLS policies allow access
4. Check service role key (not anon key) is used for admin operations

### Issue: Newsletter Preview Not Showing New Sections

1. Check database for campaign AI app selections
2. Verify newsletter_sections table has correct entries
3. Check console logs in preview route
4. Verify section generators are imported correctly

---

## 📞 Next Steps After Friday

Once test email is successful:

1. **Content Addition**: Add 20+ more AI apps and prompts
2. **RSS Feed**: Configure accounting/AI news sources
3. **Automation**: Set up cron jobs for daily newsletters
4. **Production Launch**: Create production group and send first newsletter
5. **Analytics**: Track open rates, click rates, and engagement
6. **Second Newsletter**: Apply same pattern for legal/medical professionals

---

**Ready to start?** Open Claude Code in `C:\Users\dpenn\Documents\AI_Pros_Newsletter` and begin with Phase 1!
