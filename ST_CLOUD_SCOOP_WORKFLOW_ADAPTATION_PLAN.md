# St. Cloud Scoop Workflow Migration Plan
## Adapting Multi-Newsletter Architecture to Single-Newsletter Local News System

**Date:** 2025-01-22
**Current System:** St. Cloud Scoop Newsletter (Single-tenant local news system)
**Source:** Multi-newsletter workflow architecture migration guide
**Adaptation Approach:** Simplify multi-tenant features while adopting workflow and testing improvements

---

## Executive Summary

This plan adapts a sophisticated multi-newsletter workflow system to St. Cloud Scoop's simpler single-newsletter architecture. We'll keep the newsletter sections and content structure **exactly as-is**, but enhance the underlying AI prompt management, testing infrastructure, RSS processing, and execution workflow.

**Key Adaptations:**
- ✅ **Keep:** Newsletter structure (Primary, Secondary, Events, Road Work, etc.)
- ✅ **Keep:** Current RSS sources and content types
- ✅ **Keep:** Email sending and scheduling logic
- ✅ **Enhance:** AI prompt management and testing
- ✅ **Enhance:** RSS processing frequency and reliability
- ✅ **Enhance:** Workflow execution with better timeout handling

---

## Table of Contents

1. [Current St. Cloud Scoop State](#current-st-cloud-scoop-state)
2. [AI Prompt Architecture](#1-ai-prompt-architecture)
3. [Settings > AI Prompts Page](#2-settings--ai-prompts-page)
4. [AI Prompt Testing Playground](#3-ai-prompt-testing-playground)
5. [RSS Ingestion Frequency](#4-rss-ingestion-frequency)
6. [Workflow-Based Processing](#5-workflow-based-processing)
7. [Implementation Roadmap](#implementation-roadmap)

---

## Current St. Cloud Scoop State

### ✅ Already Implemented

**AI Prompt Architecture (Partial):**
- Database storage in `app_settings` table
- Placeholder replacement with `{{variable}}` syntax
- Structured JSON format support via `callWithStructuredPrompt()`
- **6 prompts** support database:
  - `contentEvaluator` (article scoring)
  - `newsletterWriter` (article generation)
  - `eventSummarizer` (event descriptions)
  - `subjectLineGenerator` (email subject lines)
  - `topicDeduper` (duplicate detection)
  - `imageAnalyzer` (image tagging)
- **3 prompts** hardcoded:
  - `factChecker` (article validation)
  - `roadWorkValidator` (road work data validation)
  - `roadWorkGenerator` (road work content generation)

**Settings > AI Prompts Page:**
- Tab exists in `/dashboard/settings`
- Edit, Save, Reset to Default, Save as Default buttons
- Test button calling `/api/debug/test-ai-prompts`
- Grouped display by category
- Loading/saving states with user feedback

**RSS Processing:**
- Runs daily at 8:30 PM CT via Vercel cron
- Single long-running function (12-minute timeout)
- Processes all RSS feeds at once
- Generates articles, subject lines, events, road work
- Auto-selects top 3 articles per section

**Newsletter Structure:**
- **Primary Articles:** Top 3 from scored RSS posts
- **Secondary Articles:** Additional 3 from secondary feeds
- **Events Section:** Auto-populated with 8 events per day
- **Road Work Section:** AI-generated 9 road work items
- **Subject Line:** AI-generated from #1 article
- **Preview:** HTML email generation with all sections

### ❌ Not Implemented

**AI Prompt Architecture Gaps:**
- No AI provider selection (OpenAI only, no Claude)
- Incomplete JSON API request storage (only partial configs)
- Hardcoded prompts not using database

**Testing Infrastructure:**
- No dedicated AI testing playground page
- No test with multiple RSS posts feature
- No detailed response inspection (collapsible sections)
- No test history tracking
- No source post display in test results

**RSS Processing:**
- Only runs once daily (vs. every 15 minutes in guide)
- Single timeout risk (not split into workflow steps)
- No mid-execution progress visibility

**Workflow System:**
- No Vercel Workflow SDK implementation
- No step-by-step execution with individual timeouts
- No per-step retry capability
- Limited debugging visibility

---

## 1. AI Prompt Architecture

### Current Implementation

**File:** `src/lib/openai.ts`

**What Works:**
- `FALLBACK_PROMPTS` object with all hardcoded prompt templates
- `AI_PROMPTS` async functions that check database first, fallback to code
- `callWithStructuredPrompt()` for JSON-based prompts with placeholders
- Placeholder replacement: `{{title}}`, `{{description}}`, `{{content}}`, `{{url}}`

**What's Missing:**
- Complete JSON API request storage (only messages stored, not model/temperature/etc.)
- AI provider selection (no Claude support)
- Multi-tenant isolation (not needed for St. Cloud - single newsletter only)

### Adaptation for St. Cloud Scoop

**Key Decision: Simplified Single-Newsletter Architecture**

Since St. Cloud Scoop is a **single newsletter system** (not multi-tenant), we can simplify:
- ❌ **Skip:** `newsletter_id` filtering (St. Cloud has only one newsletter)
- ❌ **Skip:** Multi-newsletter isolation logic
- ✅ **Keep:** Database prompt storage for easy editing
- ✅ **Add:** AI provider selection (OpenAI vs. Claude)
- ✅ **Add:** Complete JSON API request storage

### Updated Database Schema

**Existing Schema (Keep As-Is):**
```sql
app_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  description TEXT,
  updated_at TIMESTAMPTZ,
  custom_default TEXT  -- Already exists from CLAUDE.md Session 6
)
```

**New Columns to Add:**
```sql
ALTER TABLE app_settings
ADD COLUMN ai_provider TEXT DEFAULT 'openai';  -- 'openai' or 'claude'
```

**Why No `newsletter_id`?**
St. Cloud Scoop is single-newsletter only. Adding `newsletter_id` would be over-engineering.

### Complete Prompt Structure

**Example: Content Evaluator Prompt**

```json
{
  "model": "gpt-4o",
  "temperature": 0.3,
  "max_output_tokens": 1000,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "ArticleScoring",
      "schema": {
        "type": "object",
        "properties": {
          "interest_level": { "type": "number" },
          "local_relevance": { "type": "number" },
          "community_impact": { "type": "number" },
          "reasoning": { "type": "string" }
        },
        "required": ["interest_level", "local_relevance", "community_impact", "reasoning"],
        "additionalProperties": false
      },
      "strict": true
    }
  },
  "messages": [
    {
      "role": "system",
      "content": "You are evaluating a news article for inclusion in a local St. Cloud, Minnesota newsletter..."
    },
    {
      "role": "user",
      "content": "Article Title: {{title}}\nArticle Description: {{description}}\nArticle Content: {{content}}\n\n{{imagePenalty}}"
    }
  ]
}
```

### Implementation: Enhanced `callAIWithPrompt()`

**Location:** `src/lib/openai.ts`

**New Function Signature:**
```typescript
export async function callAIWithPrompt(
  promptKey: string,
  placeholders: Record<string, string> = {},
  fallbackText?: string
): Promise<any>
```

**Changes from Source Guide:**
- ❌ Removed `newsletterId` parameter (St. Cloud is single-newsletter)
- ✅ Kept `promptKey` for database lookup
- ✅ Kept `placeholders` for dynamic content
- ✅ Kept `fallbackText` for backward compatibility

**Pseudocode:**
```typescript
export async function callAIWithPrompt(promptKey, placeholders, fallbackText) {
  // 1. Load complete JSON prompt from database
  const promptJSON = await getPromptJSON(promptKey, fallbackText)

  // 2. Extract provider ('openai' or 'claude')
  const provider = promptJSON._provider || 'openai'

  // 3. Remove internal fields
  delete promptJSON._provider

  // 4. Replace placeholders in all messages
  const processedMessages = replaceAllPlaceholders(promptJSON.messages, placeholders)

  // 5. Call appropriate AI provider
  if (provider === 'openai') {
    return await callOpenAI(promptJSON)
  } else {
    return await callClaude(promptJSON)
  }
}
```

### St. Cloud-Specific Prompt Types

**Keep All Existing Prompts:**
1. `ai_prompt_content_evaluator` - Article scoring (interest, relevance, impact)
2. `ai_prompt_newsletter_writer` - Article generation (40-75 words)
3. `ai_prompt_event_summary` - Event descriptions (50 words)
4. `ai_prompt_subject_line` - Email subject lines (≤40 characters)
5. `ai_prompt_topic_deduper` - Duplicate article detection
6. `ai_prompt_image_analyzer` - Image tagging and OCR
7. `ai_prompt_fact_checker` - Article validation (non-editable)
8. `ai_prompt_road_work` - Road work generation (non-editable for now)
9. `ai_prompt_road_work_validator` - Road work validation (non-editable)

**Editable vs. Non-Editable:**
- **Editable (6):** content_evaluator, newsletter_writer, event_summary, subject_line, topic_deduper, image_analyzer
- **Non-Editable (3):** fact_checker, road_work, road_work_validator (complex, specialized logic)

---

## 2. Settings > AI Prompts Page

### Current Implementation

**File:** `src/app/dashboard/settings/page.tsx`

**What Works:**
- Tab navigation with "AI Prompts" tab
- Grouped display by category
- Edit mode with textarea
- Save, Reset, Save as Default buttons
- Test button calling `/api/debug/test-ai-prompts`
- Loading and saving states
- Success/error messages

**What's Missing:**
- AI provider selector (OpenAI vs. Claude)
- JSON validation and formatting help
- Test button opens results in modal (not in new tab)
- No RSS post selector for testing
- No indication of prompt format (structured JSON vs. plain text)

### Adaptation for St. Cloud Scoop

**Enhancements to Add:**

#### 1. **AI Provider Selector**

Add toggle buttons to select OpenAI or Claude:

```typescript
{/* AI Provider Selector */}
<div className="mb-4">
  <label className="block text-sm font-medium text-gray-700 mb-2">
    AI Provider
  </label>
  <div className="flex gap-4">
    <button
      onClick={() => updateProvider('openai')}
      className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
        editingPrompt?.ai_provider === 'openai'
          ? 'border-blue-500 bg-blue-50 text-blue-700'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
      }`}
    >
      OpenAI
    </button>
    <button
      onClick={() => updateProvider('claude')}
      className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
        editingPrompt?.ai_provider === 'claude'
          ? 'border-purple-500 bg-purple-50 text-purple-700'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
      }`}
    >
      Claude
    </button>
  </div>
</div>
```

#### 2. **Format Indicator**

Show whether prompt is structured JSON or plain text:

```typescript
{/* Format Indicator */}
<div className="mb-2 text-sm text-gray-600">
  {isStructuredFormat(editingPrompt?.value) ? (
    <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-100 text-green-800">
      ✓ Structured JSON Format
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-1 rounded-md bg-yellow-100 text-yellow-800">
      ⚠ Plain Text Format (will be converted to JSON)
    </span>
  )}
</div>
```

#### 3. **JSON Validation Helper**

Add button to validate and format JSON:

```typescript
<button
  onClick={() => validateAndFormatJSON()}
  className="px-3 py-1 text-sm text-blue-700 bg-blue-50 border border-blue-300 rounded-md hover:bg-blue-100"
>
  Validate & Format JSON
</button>
```

#### 4. **Enhanced Test Modal**

Replace test button that opens new tab with modal showing:
- Test results
- API call details (collapsible)
- Source RSS post used (collapsible)
- Full API response (collapsible)

### St. Cloud-Specific Categorization

**Keep Existing Categories:**
```typescript
const categories = {
  'Article Generation': [
    'ai_prompt_content_evaluator',
    'ai_prompt_newsletter_writer',
    'ai_prompt_topic_deduper'
  ],
  'Newsletter Formatting': [
    'ai_prompt_subject_line',
    'ai_prompt_event_summary'
  ],
  'Content Analysis': [
    'ai_prompt_image_analyzer'
  ],
  'Non-Editable (Advanced)': [
    'ai_prompt_fact_checker',
    'ai_prompt_road_work',
    'ai_prompt_road_work_validator'
  ]
}
```

### API Endpoints

#### `GET /api/settings/ai-prompts`

**Current:** Returns prompts with `key`, `value`, `description`
**Enhanced:** Add `ai_provider` field

```typescript
// Response:
{
  prompts: [
    {
      key: 'ai_prompt_content_evaluator',
      name: 'Content Evaluator',
      description: 'Scores articles for newsletter inclusion',
      value: { model: 'gpt-4o', messages: [...] },
      ai_provider: 'openai',
      category: 'Article Generation',
      is_editable: true
    },
    // ... more prompts
  ],
  grouped: {
    'Article Generation': [ /* prompts */ ],
    'Newsletter Formatting': [ /* prompts */ ],
    // ... more categories
  }
}
```

#### `PATCH /api/settings/ai-prompts`

**Enhanced:** Save both `value` and `ai_provider`

```typescript
// Request:
{
  key: 'ai_prompt_content_evaluator',
  value: { model: 'gpt-4o', messages: [...] },
  ai_provider: 'openai'
}

// SQL:
UPDATE app_settings
SET value = $1, ai_provider = $2, updated_at = NOW()
WHERE key = $3
```

---

## 3. AI Prompt Testing Playground

### Overview

**New Feature:** Dedicated testing page for experimenting with AI prompts

**URL:** `/dashboard/settings/ai-testing`
**Location:** `src/app/dashboard/settings/ai-testing/page.tsx` (new file)

### Key Features for St. Cloud Scoop

#### 1. **Provider & Prompt Type Selectors**

```typescript
<select
  value={promptType}
  onChange={(e) => setPromptType(e.target.value)}
  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
>
  <optgroup label="Article Generation">
    <option value="content-evaluator">Content Evaluator</option>
    <option value="newsletter-writer">Newsletter Writer</option>
    <option value="topic-deduper">Topic Deduper</option>
  </optgroup>
  <optgroup label="Newsletter Formatting">
    <option value="subject-line">Subject Line Generator</option>
    <option value="event-summary">Event Summarizer</option>
  </optgroup>
  <optgroup label="Content Analysis">
    <option value="image-analyzer">Image Analyzer</option>
  </optgroup>
</select>
```

#### 2. **RSS Post Selector**

Show recent RSS posts from St. Cloud feeds:

```typescript
<div className="mb-4">
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Test with RSS Post
  </label>
  <select
    value={selectedPostId}
    onChange={(e) => setSelectedPostId(e.target.value)}
    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
  >
    <option value="">Select a recent RSS post...</option>
    {recentPosts.map(post => (
      <option key={post.id} value={post.id}>
        {post.title.substring(0, 80)}...
      </option>
    ))}
  </select>
</div>
```

#### 3. **JSON Editor with Auto-Load**

Load current live prompt from database:

```typescript
useEffect(() => {
  loadLivePrompt()
}, [provider, promptType])

async function loadLivePrompt() {
  const res = await fetch(
    `/api/ai/load-live-prompt?provider=${provider}&prompt_type=${promptType}`
  )
  const data = await res.json()

  if (data.success && data.data?.prompt) {
    setPrompt(data.data.prompt)
    setProviderMatches(data.data.provider_matches)
  }
}
```

#### 4. **Test Single Post**

Test prompt with one RSS post:

```typescript
<button
  onClick={handleTestSingle}
  disabled={testing}
  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
>
  {testing ? 'Testing...' : 'Test with Selected Post'}
</button>
```

#### 5. **Test Multiple Posts (10 Articles)**

New feature adapted from guide:

```typescript
<button
  onClick={handleTestMultiple}
  disabled={testing}
  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
>
  {testing ? 'Testing...' : 'Test with 10 Articles'}
</button>
```

**Implementation:**
```typescript
async function handleTestMultiple() {
  setTesting(true)

  const res = await fetch('/api/ai/test-prompt-multiple', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      promptJson: JSON.parse(prompt),
      prompt_type: promptType,
      limit: 10
    })
  })

  const data = await res.json()

  setTestResults({
    responses: data.responses,      // Array of 10 responses
    sourcePosts: data.sourcePosts,  // Array of 10 RSS posts used
    totalTokensUsed: data.totalTokensUsed,
    totalDuration: data.totalDuration
  })

  setTesting(false)
  setShowModal(true)
}
```

#### 6. **Results Modal**

Show test results with collapsible sections:

```typescript
{showModal && testResults && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b">
        <h3 className="text-lg font-semibold">Test Results</h3>
        <p className="text-sm text-gray-600">
          {testResults.provider} • {testResults.model} • {testResults.duration}ms
          {testResults.tokensUsed && ` • ${testResults.tokensUsed} tokens`}
        </p>
      </div>

      {/* Body */}
      <div className="p-6 overflow-y-auto space-y-4">
        {/* API Call Details (Collapsible) */}
        <CollapsibleSection title="API Call Details">
          <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-x-auto">
            {JSON.stringify(testResults.apiRequest, null, 2)}
          </pre>
        </CollapsibleSection>

        {/* Source Posts (for multiple article tests) */}
        {testResults.isMultiple && (
          <CollapsibleSection title={`Source Articles (${testResults.sourcePosts.length})`}>
            {testResults.sourcePosts.map((post, i) => (
              <div key={i} className="border rounded-lg p-4 mb-4">
                <h5 className="font-semibold">Article {i + 1}</h5>
                <p><strong>Title:</strong> {post.title}</p>
                <p><strong>Description:</strong> {post.description}</p>
              </div>
            ))}
          </CollapsibleSection>
        )}

        {/* AI Responses */}
        <div className="border rounded-lg p-4">
          <h4 className="font-semibold mb-2">AI Responses</h4>
          {testResults.isMultiple ? (
            testResults.responses.map((response, i) => (
              <div key={i} className="mb-4">
                <h5 className="font-medium">Article {i + 1}</h5>
                <pre className="text-xs bg-gray-50 p-3 rounded-lg">
                  {JSON.stringify(response, null, 2)}
                </pre>
              </div>
            ))
          ) : (
            <pre className="text-xs bg-gray-50 p-3 rounded-lg">
              {JSON.stringify(testResults.response, null, 2)}
            </pre>
          )}
        </div>

        {/* Full API Responses (Collapsible) */}
        {testResults.fullApiResponses && (
          <CollapsibleSection title="Full API Responses">
            {testResults.fullApiResponses.map((resp, i) => (
              <div key={i} className="mb-4">
                <h5>Article {i + 1} - Full API Response</h5>
                <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-x-auto">
                  {JSON.stringify(resp, null, 2)}
                </pre>
              </div>
            ))}
          </CollapsibleSection>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 border-t flex justify-end">
        <button
          onClick={() => setShowModal(false)}
          className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}
```

#### 7. **Reference Guide**

Quick reference for St. Cloud-specific placeholders and response formats:

```typescript
<div className="bg-white rounded-lg shadow p-6">
  <h2 className="text-lg font-semibold mb-4">St. Cloud Scoop Quick Reference</h2>

  {/* Placeholders */}
  <div className="mb-6">
    <h3 className="font-medium mb-2">Available Placeholders</h3>
    <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
      <div><code>{{title}}</code> - Article title/headline</div>
      <div><code>{{description}}</code> - Article description</div>
      <div><code>{{content}}</code> - Full article text</div>
      <div><code>{{url}}</code> - Source URL</div>
      <div><code>{{imagePenalty}}</code> - Image penalty text (content evaluator)</div>
      <div><code>{{articles}}</code> - Article list (subject line generator)</div>
    </div>
  </div>

  {/* Expected Response Formats */}
  <div className="mb-6">
    <h3 className="font-medium mb-2">Expected Response Formats</h3>
    <div className="space-y-3 text-xs">
      <div>
        <div className="font-semibold">Content Evaluator:</div>
        <pre>{"{\n  \"interest_level\": <1-20>,\n  \"local_relevance\": <1-10>,\n  \"community_impact\": <1-10>,\n  \"reasoning\": \"string\"\n}"}</pre>
      </div>
      <div>
        <div className="font-semibold">Newsletter Writer:</div>
        <pre>{"{\n  \"headline\": \"string\",\n  \"content\": \"string\",\n  \"word_count\": <integer>\n}"}</pre>
      </div>
      <div>
        <div className="font-semibold">Subject Line Generator:</div>
        <pre>Plain text string (≤40 characters)</pre>
      </div>
    </div>
  </div>
</div>
```

### API Endpoints (New)

#### `GET /api/ai/load-live-prompt`

Load current live prompt from `app_settings`:

```typescript
// Query params: provider, prompt_type
// Returns:
{
  success: true,
  data: {
    prompt: '{ "model": "gpt-4o", ... }',
    provider_matches: true  // Whether ai_provider matches selected
  }
}
```

#### `POST /api/ai/test-prompt`

Test prompt with single RSS post:

```typescript
// Request:
{
  provider: 'openai',
  promptJson: { model: 'gpt-4o', messages: [...] },
  post: {
    id: 'post123',
    title: '...',
    description: '...',
    full_article_text: '...'
  }
}

// Response:
{
  success: true,
  provider: 'openai',
  model: 'gpt-4o',
  response: { interest_level: 15, ... },
  tokensUsed: 250,
  duration: 1500,
  apiRequest: { /* exact request sent */ },
  fullApiResponse: { /* complete API response */ }
}
```

#### `POST /api/ai/test-prompt-multiple`

Test prompt with 10 RSS posts:

```typescript
// Request:
{
  provider: 'openai',
  promptJson: { model: 'gpt-4o', messages: [...] },
  prompt_type: 'content-evaluator',
  limit: 10
}

// Response:
{
  success: true,
  provider: 'openai',
  model: 'gpt-4o',
  responses: [
    { interest_level: 15, ... },
    { interest_level: 12, ... },
    // ... 10 responses
  ],
  totalTokensUsed: 2500,
  totalDuration: 15000,
  apiRequest: { /* exact request sent */ },
  fullApiResponses: [ /* 10 complete responses */ ],
  sourcePosts: [
    { id: 'post1', title: '...', description: '...', content: '...' },
    // ... 10 posts
  ]
}
```

---

## 4. RSS Ingestion Frequency

### Current Implementation

**Cron Schedule:** Daily at 8:30 PM CT
**Endpoint:** `/api/cron/rss-processing`
**Duration:** 12-minute timeout
**Process:** Create campaign → Process RSS → Generate articles → Select top 3 → Generate subject line

### Source Guide Recommendation

**Cron Schedule:** Every 15 minutes
**Endpoint:** `/api/cron/ingest-rss`
**Purpose:** Keep RSS posts table fresh with latest content

**Rationale from Guide:**
- Fresh content always available
- Timely scoring
- Balanced load
- Cost efficient

### Adaptation for St. Cloud Scoop

**Key Decision: Keep Daily Schedule, Add Separate Ingestion Cron**

**Rationale:**
- St. Cloud local news doesn't change every 15 minutes like national news
- Most St. Cloud sources (city government, schools, police) post 1-5 times per day
- Daily newsletter doesn't need real-time content
- **BUT:** Separating RSS ingestion from campaign processing improves reliability

**Recommended Approach:**

#### Option A: Every 15 Minutes (Full Guide Implementation)
```json
{
  "crons": [
    {
      "path": "/api/cron/ingest-rss",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

**Pros:**
- Always fresh content
- Aligns with source guide
- Better for breaking news

**Cons:**
- Overkill for St. Cloud local news
- Higher API usage for scoring
- More Vercel function invocations

#### Option B: Every Hour (Balanced Approach) ⭐ **RECOMMENDED**
```json
{
  "crons": [
    {
      "path": "/api/cron/ingest-rss",
      "schedule": "0 * * * *"
    }
  ]
}
```

**Pros:**
- Balance between freshness and cost
- Captures morning, afternoon, evening posts
- Still separate from campaign processing
- 24 runs per day vs. 96 with 15-minute schedule

**Cons:**
- Not as fresh as 15-minute schedule
- Still more frequent than current daily approach

#### Option C: Every 4 Hours (Conservative Approach)
```json
{
  "crons": [
    {
      "path": "/api/cron/ingest-rss",
      "schedule": "0 */4 * * *"
    }
  ]
}
```

**Pros:**
- Minimal cost increase
- Captures daily news cycles (morning, afternoon, evening)
- 6 runs per day

**Cons:**
- Not as fresh as hourly schedule

### Implementation: Separate RSS Ingestion

**New File:** `src/app/api/cron/ingest-rss/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { RSSProcessor } from '@/lib/rss-processor'

export async function GET(request: NextRequest) {
  try {
    // Auth check (Vercel cron or manual with secret)
    const searchParams = new URL(request.url).searchParams
    const secret = searchParams.get('secret')

    const isVercelCron = !secret && !searchParams.has('secret')
    const isManualTest = secret === process.env.CRON_SECRET

    if (!isVercelCron && !isManualTest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all active RSS feeds for St. Cloud Scoop
    const { data: feeds, error: feedsError } = await supabaseAdmin
      .from('rss_feeds')
      .select('*')
      .eq('active', true)

    if (feedsError || !feeds || feeds.length === 0) {
      console.log('[RSS Ingest] No active feeds found')
      return NextResponse.json({
        success: true,
        message: 'No active feeds',
        processed: 0
      })
    }

    console.log(`[RSS Ingest] Processing ${feeds.length} St. Cloud RSS feeds`)

    const processor = new RSSProcessor()
    let totalPosts = 0

    // Process each feed
    for (const feed of feeds) {
      try {
        const posts = await processor.fetchAndParseFeed(feed.url)

        // Save posts to database
        await processor.savePosts(posts, feed.id)

        totalPosts += posts.length
        console.log(`[RSS Ingest] Feed ${feed.name}: ${posts.length} posts`)
      } catch (error) {
        console.error(`[RSS Ingest] Error processing ${feed.name}:`, error)
        // Continue with next feed
      }
    }

    console.log(`[RSS Ingest] Complete: ${totalPosts} total posts`)

    return NextResponse.json({
      success: true,
      message: `Processed ${feeds.length} feeds`,
      totalPosts,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[RSS Ingest] Failed:', error)
    return NextResponse.json({
      error: 'RSS ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const maxDuration = 300  // 5 minutes
```

**Updated `vercel.json`:**
```json
{
  "crons": [
    {
      "path": "/api/cron/ingest-rss",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/rss-processing",
      "schedule": "30 20 * * *"
    }
  ],
  "functions": {
    "app/api/cron/ingest-rss/route.ts": {
      "maxDuration": 300
    },
    "app/api/cron/rss-processing/route.ts": {
      "maxDuration": 420
    }
  }
}
```

**Benefits:**
- RSS ingestion runs hourly (or every 4 hours)
- Campaign processing still runs daily at 8:30 PM
- Separate concerns = better reliability
- Ingestion timeout: 5 minutes
- Campaign processing timeout: 7 minutes (increased from 5)

---

## 5. Workflow-Based Processing

### Current Implementation

**Architecture:** Single long-running function

**File:** `src/app/api/cron/rss-processing/route.ts`

**Process:**
1. Create campaign
2. Fetch RSS posts
3. Extract full article text
4. Score posts with AI
5. Generate articles
6. Select top 3
7. Generate subject line
8. Finalize campaign

**Timeout:** 420 seconds (7 minutes)

**Issues:**
- Single timeout for entire process
- No mid-execution progress visibility
- If one step fails, entire process fails
- Hard to debug which step caused failure

### Source Guide Recommendation

**Architecture:** 10-step workflow using Vercel Workflow SDK

**Benefits:**
- Each step gets 800-second timeout
- Clear progress logging
- Steps can retry independently
- Easy to debug specific steps

**Structure:**
```
Step 1:  Setup + Deduplication
Step 2:  Generate 6 primary titles
Step 3:  Generate 3 primary bodies (batch 1)
Step 4:  Generate 3 primary bodies (batch 2)
Step 5:  Fact-check all 6 primary articles
Step 6:  Generate 6 secondary titles
Step 7:  Generate 3 secondary bodies (batch 1)
Step 8:  Generate 3 secondary bodies (batch 2)
Step 9:  Fact-check all 6 secondary articles
Step 10: Finalize
```

### Adaptation for St. Cloud Scoop

**Key Decision: Adapt Workflow Structure to St. Cloud Newsletter**

St. Cloud newsletter structure is different from multi-newsletter guide:
- **Primary Section:** 3 articles (not 6)
- **Secondary Section:** 3 articles (not 6)
- **Events Section:** 8 events per day (auto-populated)
- **Road Work Section:** 9 road work items (AI-generated)

**Recommended St. Cloud Workflow:**

```
Step 1:  Setup - Create campaign, assign posts, deduplicate
Step 2:  Generate 3 primary articles (titles + bodies)
Step 3:  Fact-check 3 primary articles
Step 4:  Generate 3 secondary articles (titles + bodies)
Step 5:  Fact-check 3 secondary articles
Step 6:  Populate events (8 events per day)
Step 7:  Generate road work section (9 items)
Step 8:  Finalize - Select top 3 per section, generate subject line, create welcome
```

**Simplified from 10 steps to 8 steps** - St. Cloud generates fewer articles, so less batching needed.

### Implementation: Vercel Workflow

#### Install Vercel Workflow SDK

```bash
npm install workflow
```

#### Create Workflow File

**New File:** `src/lib/workflows/process-rss-workflow.ts`

```typescript
import { supabaseAdmin } from '@/lib/supabase'
import { RSSProcessor } from '@/lib/rss-processor'

/**
 * St. Cloud Scoop RSS Processing Workflow
 * 8-step workflow with individual 800-second timeouts per step
 */
export async function processRSSWorkflow(input: {
  trigger: 'cron' | 'manual'
}) {
  "use workflow"

  let campaignId: string

  console.log('[Workflow] Starting St. Cloud Scoop newsletter processing')

  // STEP 1: Setup - Create campaign, assign posts, deduplicate
  campaignId = await setupCampaign()

  // PRIMARY SECTION
  // STEP 2: Generate 3 primary articles (titles + bodies together)
  await generatePrimaryArticles(campaignId)

  // STEP 3: Fact-check 3 primary articles
  await factCheckPrimary(campaignId)

  // SECONDARY SECTION
  // STEP 4: Generate 3 secondary articles (titles + bodies together)
  await generateSecondaryArticles(campaignId)

  // STEP 5: Fact-check 3 secondary articles
  await factCheckSecondary(campaignId)

  // ADDITIONAL SECTIONS
  // STEP 6: Populate events (8 events per day, random selection)
  await populateEvents(campaignId)

  // STEP 7: Generate road work section (9 items)
  await generateRoadWork(campaignId)

  // STEP 8: Finalize - Select top 3, generate subject line, create welcome
  await finalizeCampaign(campaignId)

  console.log('=== WORKFLOW COMPLETE ===')

  return { campaignId, success: true }
}

// Step 1: Setup
async function setupCampaign() {
  "use step"

  console.log('[Workflow Step 1/8] Setting up campaign...')

  const processor = new RSSProcessor()

  // Calculate campaign date (Central Time + 12 hours)
  const nowCentral = new Date().toLocaleString("en-US", {timeZone: "America/Chicago"})
  const centralDate = new Date(nowCentral)
  centralDate.setHours(centralDate.getHours() + 12)
  const campaignDate = centralDate.toISOString().split('T')[0]

  // Create new campaign
  const { data: newCampaign, error: createError } = await supabaseAdmin
    .from('newsletter_campaigns')
    .insert([{
      date: campaignDate,
      status: 'processing'
    }])
    .select('id')
    .single()

  if (createError || !newCampaign) {
    throw new Error('Failed to create campaign')
  }

  const id = newCampaign.id
  console.log(`[Workflow Step 1/8] Campaign created: ${id} for ${campaignDate}`)

  // Get feed IDs for primary and secondary sections
  const { data: primaryFeeds } = await supabaseAdmin
    .from('rss_feeds')
    .select('id')
    .eq('active', true)
    .eq('use_for_primary_section', true)

  const { data: secondaryFeeds } = await supabaseAdmin
    .from('rss_feeds')
    .select('id')
    .eq('active', true)
    .eq('use_for_secondary_section', true)

  const primaryFeedIds = primaryFeeds?.map(f => f.id) || []
  const secondaryFeedIds = secondaryFeeds?.map(f => f.id) || []

  // Get lookback window (default 72 hours)
  const { data: lookbackSetting } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'primary_article_lookback_hours')
    .single()

  const lookbackHours = lookbackSetting ? parseInt(lookbackSetting.value) : 72
  const lookbackDate = new Date()
  lookbackDate.setHours(lookbackDate.getHours() - lookbackHours)
  const lookbackTimestamp = lookbackDate.toISOString()

  // Get and assign top 12 primary posts
  const { data: allPrimaryPosts } = await supabaseAdmin
    .from('rss_posts')
    .select('id, post_ratings(total_score)')
    .in('feed_id', primaryFeedIds)
    .is('campaign_id', null)
    .gte('processed_at', lookbackTimestamp)
    .not('post_ratings', 'is', null)

  const topPrimary = allPrimaryPosts
    ?.sort((a: any, b: any) => {
      const scoreA = a.post_ratings?.[0]?.total_score || 0
      const scoreB = b.post_ratings?.[0]?.total_score || 0
      return scoreB - scoreA
    })
    .slice(0, 12) || []

  // Get and assign top 12 secondary posts
  const { data: allSecondaryPosts } = await supabaseAdmin
    .from('rss_posts')
    .select('id, post_ratings(total_score)')
    .in('feed_id', secondaryFeedIds)
    .is('campaign_id', null)
    .gte('processed_at', lookbackTimestamp)
    .not('post_ratings', 'is', null)

  const topSecondary = allSecondaryPosts
    ?.sort((a: any, b: any) => {
      const scoreA = a.post_ratings?.[0]?.total_score || 0
      const scoreB = b.post_ratings?.[0]?.total_score || 0
      return scoreB - scoreA
    })
    .slice(0, 12) || []

  // Assign to campaign
  if (topPrimary.length > 0) {
    await supabaseAdmin
      .from('rss_posts')
      .update({ campaign_id: id })
      .in('id', topPrimary.map(p => p.id))
  }

  if (topSecondary.length > 0) {
    await supabaseAdmin
      .from('rss_posts')
      .update({ campaign_id: id })
      .in('id', topSecondary.map(p => p.id))
  }

  console.log(`[Workflow Step 1/8] Assigned ${topPrimary.length} primary, ${topSecondary.length} secondary posts`)

  // Deduplicate
  const dedupeResult = await processor.handleDuplicatesForCampaign(id)
  console.log(`[Workflow Step 1/8] Deduplication: ${dedupeResult.groups} groups, ${dedupeResult.duplicates} duplicates`)
  console.log('[Workflow Step 1/8] ✓ Setup complete')

  return id
}

// Step 2: Generate Primary Articles
async function generatePrimaryArticles(campaignId: string) {
  "use step"

  console.log('[Workflow Step 2/8] Generating 3 primary articles...')
  const processor = new RSSProcessor()

  // Generate titles and bodies together (St. Cloud generates fewer articles than guide)
  await processor.generateArticles(campaignId, 'primary', 3)

  const { data: articles } = await supabaseAdmin
    .from('articles')
    .select('id, headline, content')
    .eq('campaign_id', campaignId)
    .not('headline', 'is', null)
    .not('content', 'is', null)

  console.log(`[Workflow Step 2/8] ✓ Generated ${articles?.length || 0} primary articles`)
}

// Step 3: Fact-Check Primary
async function factCheckPrimary(campaignId: string) {
  "use step"

  console.log('[Workflow Step 3/8] Fact-checking primary articles...')
  const processor = new RSSProcessor()
  await processor.factCheckArticles(campaignId, 'primary')

  const { data: articles } = await supabaseAdmin
    .from('articles')
    .select('id, fact_check_score')
    .eq('campaign_id', campaignId)
    .not('fact_check_score', 'is', null)

  const avgScore = (articles?.reduce((sum, a) => sum + (a.fact_check_score || 0), 0) || 0) / (articles?.length || 1)
  console.log(`[Workflow Step 3/8] ✓ Fact-checked ${articles?.length || 0} articles (avg: ${avgScore.toFixed(1)}/10)`)
}

// Step 4: Generate Secondary Articles
async function generateSecondaryArticles(campaignId: string) {
  "use step"

  console.log('[Workflow Step 4/8] Generating 3 secondary articles...')
  const processor = new RSSProcessor()
  await processor.generateArticles(campaignId, 'secondary', 3)

  const { data: articles } = await supabaseAdmin
    .from('articles')
    .select('id, headline, content')
    .eq('campaign_id', campaignId)
    .not('headline', 'is', null)
    .not('content', 'is', null)

  console.log(`[Workflow Step 4/8] ✓ Generated ${articles?.length || 0} secondary articles`)
}

// Step 5: Fact-Check Secondary
async function factCheckSecondary(campaignId: string) {
  "use step"

  console.log('[Workflow Step 5/8] Fact-checking secondary articles...')
  const processor = new RSSProcessor()
  await processor.factCheckArticles(campaignId, 'secondary')

  const { data: articles } = await supabaseAdmin
    .from('articles')
    .select('id, fact_check_score')
    .eq('campaign_id', campaignId)
    .not('fact_check_score', 'is', null)

  const avgScore = (articles?.reduce((sum, a) => sum + (a.fact_check_score || 0), 0) || 0) / (articles?.length || 1)
  console.log(`[Workflow Step 5/8] ✓ Fact-checked ${articles?.length || 0} articles (avg: ${avgScore.toFixed(1)}/10)`)
}

// Step 6: Populate Events
async function populateEvents(campaignId: string) {
  "use step"

  console.log('[Workflow Step 6/8] Populating events section...')
  const processor = new RSSProcessor()

  // Auto-populate events (8 events per day, random selection)
  await processor.populateEventsForCampaignSmart(campaignId)

  const { data: events } = await supabaseAdmin
    .from('campaign_events')
    .select('id')
    .eq('campaign_id', campaignId)

  console.log(`[Workflow Step 6/8] ✓ Populated ${events?.length || 0} events`)
}

// Step 7: Generate Road Work
async function generateRoadWork(campaignId: string) {
  "use step"

  console.log('[Workflow Step 7/8] Generating road work section...')

  const { generateRoadWorkForCampaign } = await import('@/lib/road-work-manager')
  await generateRoadWorkForCampaign(campaignId)

  const { data: roadWork } = await supabaseAdmin
    .from('road_work_data')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .single()

  console.log(`[Workflow Step 7/8] ✓ Generated road work section`)
}

// Step 8: Finalize
async function finalizeCampaign(campaignId: string) {
  "use step"

  console.log('[Workflow Step 8/8] Finalizing campaign...')
  const processor = new RSSProcessor()

  // Auto-select top 3 per section
  await processor.selectTopArticlesForCampaign(campaignId)

  // Generate subject line (happens inside selectTopArticlesForCampaign)
  const { data: campaign } = await supabaseAdmin
    .from('newsletter_campaigns')
    .select('subject_line')
    .eq('id', campaignId)
    .single()

  console.log(`Subject line: "${campaign?.subject_line?.substring(0, 50) || 'Not found'}..."`)

  // Set status to draft
  await supabaseAdmin
    .from('newsletter_campaigns')
    .update({ status: 'draft' })
    .eq('id', campaignId)

  console.log('[Workflow Step 8/8] ✓ Campaign finalized and set to draft')
}
```

#### Create Trigger Endpoint

**New File:** `src/app/api/cron/trigger-workflow/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { ScheduleChecker } from '@/lib/schedule-checker'
import { start } from 'workflow/api'
import { processRSSWorkflow } from '@/lib/workflows/process-rss-workflow'

/**
 * Workflow Trigger Cron
 * Runs every 5 minutes to check if it's time to execute the RSS workflow
 * for St. Cloud Scoop newsletter
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const searchParams = new URL(request.url).searchParams
    const secret = searchParams.get('secret')

    const isVercelCron = !secret && !searchParams.has('secret')
    const isManualTest = secret === process.env.CRON_SECRET

    if (!isVercelCron && !isManualTest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Workflow Trigger] Checking if it\'s time to run RSS processing')

    // Check if it's time to run RSS processing
    const shouldRun = await ScheduleChecker.shouldRunRSSProcessing()

    if (!shouldRun) {
      console.log('[Workflow Trigger] Not time yet for RSS processing')
      return NextResponse.json({
        success: true,
        message: 'Not scheduled at this time',
        skipped: true,
        timestamp: new Date().toISOString()
      })
    }

    console.log('[Workflow Trigger] Starting RSS workflow for St. Cloud Scoop')

    await start(processRSSWorkflow, [{
      trigger: 'cron'
    }])

    return NextResponse.json({
      success: true,
      message: 'RSS workflow started',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Workflow Trigger] Failed:', error)
    return NextResponse.json({
      error: 'Workflow trigger failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export const maxDuration = 60
```

#### Update ScheduleChecker

**File:** `src/lib/schedule-checker.ts`

```typescript
// Remove newsletter_id parameter (St. Cloud is single-newsletter)
export class ScheduleChecker {
  public static async getScheduleSettings(): Promise<ScheduleSettings> {
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .in('key', [
        'email_reviewScheduleEnabled',
        'email_rssProcessingTime'
      ])

    const settingsMap = (settings || []).reduce((acc, setting) => {
      acc[setting.key] = setting.value
      return acc
    }, {} as Record<string, string>)

    return {
      reviewScheduleEnabled: settingsMap['email_reviewScheduleEnabled'] === 'true',
      rssProcessingTime: settingsMap['email_rssProcessingTime'] || '20:30'
    }
  }

  static async shouldRunRSSProcessing(): Promise<boolean> {
    try {
      const settings = await this.getScheduleSettings()

      if (!settings.reviewScheduleEnabled) {
        return false
      }

      const currentTime = this.getCurrentTimeInCT()
      console.log(`RSS Processing check: Current CT time ${currentTime.timeString}, Scheduled: ${settings.rssProcessingTime}`)

      return await this.isTimeToRun(
        currentTime.timeString,
        settings.rssProcessingTime,
        'last_rss_processing_run'
      )
    } catch (error) {
      console.error('Error checking RSS processing schedule:', error)
      return false
    }
  }
}
```

#### Update vercel.json

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest-rss",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/trigger-workflow",
      "schedule": "*/5 * * * *"
    }
  ],
  "functions": {
    "app/api/cron/ingest-rss/route.ts": {
      "maxDuration": 300
    },
    "app/api/cron/trigger-workflow/route.ts": {
      "maxDuration": 60
    },
    "app/api/workflows/process-rss/route.ts": {
      "maxDuration": 800
    }
  }
}
```

### Benefits of Workflow Approach for St. Cloud

| Feature | Old System | New Workflow System |
|---------|-----------|---------------------|
| **Timeout** | 420s total (7 min) | 800s per step (6400s max / 106 min) |
| **Progress** | No visibility | Step-by-step logs |
| **Retries** | All-or-nothing | Per-step retries possible |
| **Debugging** | Hard to isolate failures | Clear step boundaries |
| **Reliability** | One failure = total fail | Steps complete independently |
| **Article Generation** | All at once | Batched by section |
| **Events** | Sometimes missing | Dedicated step ensures completion |
| **Road Work** | Sometimes skipped | Dedicated step ensures generation |

---

## Implementation Roadmap

### Phase 1: AI Prompt Architecture Enhancement (Week 1)

**Goal:** Complete database-driven AI prompt system with provider selection

#### Tasks:
- [ ] Add `ai_provider` column to `app_settings` table
- [ ] Update `getPromptJSON()` to return complete JSON API requests
- [ ] Implement `callAIWithPrompt()` with OpenAI and Claude support
- [ ] Migrate all editable prompts to database with complete JSON structure:
  - [ ] `ai_prompt_content_evaluator`
  - [ ] `ai_prompt_newsletter_writer`
  - [ ] `ai_prompt_event_summary`
  - [ ] `ai_prompt_subject_line`
  - [ ] `ai_prompt_topic_deduper`
  - [ ] `ai_prompt_image_analyzer`
- [ ] Test AI calls work with both OpenAI and Claude
- [ ] Verify backward compatibility with existing prompts

**Testing:**
- [ ] Test content evaluator with real St. Cloud RSS posts
- [ ] Test newsletter writer generates 40-75 word articles
- [ ] Test subject line generator produces ≤40 character headlines
- [ ] Verify Claude provider works (if API key available)

**Deployment:**
- [ ] Deploy to production
- [ ] Monitor Vercel logs for errors
- [ ] Verify RSS processing still works end-to-end

---

### Phase 2: Settings Page & Testing Playground (Week 2)

**Goal:** Enhanced UI for managing and testing AI prompts

#### Tasks - Settings Page:
- [ ] Add AI provider selector (OpenAI/Claude toggle)
- [ ] Add format indicator (Structured JSON vs. Plain Text)
- [ ] Add JSON validation and formatting helper
- [ ] Update test modal to show detailed results
- [ ] Improve error messages and user feedback
- [ ] Add RSS post selector for testing

#### Tasks - Testing Playground:
- [ ] Create new page: `/dashboard/settings/ai-testing`
- [ ] Build provider & prompt type selectors
- [ ] Implement RSS post selector with recent posts
- [ ] Add JSON editor with auto-load from database
- [ ] Implement "Test with Selected Post" (single)
- [ ] Implement "Test with 10 Articles" (multiple)
- [ ] Build results modal with collapsible sections:
  - [ ] API call details
  - [ ] Source posts used
  - [ ] AI responses
  - [ ] Full API responses
- [ ] Add reference guide for St. Cloud placeholders
- [ ] Add test history tracking

#### API Endpoints:
- [ ] `GET /api/ai/load-live-prompt`
- [ ] `GET /api/ai/load-recent-posts`
- [ ] `POST /api/ai/test-prompt` (single post)
- [ ] `POST /api/ai/test-prompt-multiple` (10 posts)
- [ ] Update `GET /api/settings/ai-prompts` to include `ai_provider`
- [ ] Update `PATCH /api/settings/ai-prompts` to save `ai_provider`

**Testing:**
- [ ] Test AI provider switching works correctly
- [ ] Test single post testing with each prompt type
- [ ] Test multiple post testing (10 articles)
- [ ] Verify modal displays all data correctly
- [ ] Test JSON validation catches errors

**Deployment:**
- [ ] Deploy to production
- [ ] User acceptance testing (have user try testing playground)
- [ ] Gather feedback on UX improvements

---

### Phase 3: RSS Ingestion Frequency (Week 3)

**Goal:** Separate RSS ingestion from campaign processing for better reliability

#### Tasks:
- [ ] Create `/api/cron/ingest-rss` endpoint
- [ ] Implement RSS feed fetching and parsing logic
- [ ] Add error handling for failed feeds (continue with others)
- [ ] Update `vercel.json` with chosen cron schedule:
  - [ ] **Option A:** Every 15 minutes (`*/15 * * * *`)
  - [ ] **Option B:** Every hour (`0 * * * *`) ⭐ RECOMMENDED
  - [ ] **Option C:** Every 4 hours (`0 */4 * * *`)
- [ ] Set `maxDuration: 300` (5 minutes)
- [ ] Remove RSS ingestion logic from campaign processing
- [ ] Update campaign processing to use pre-ingested posts

**Testing:**
- [ ] Test cron endpoint locally with secret parameter
- [ ] Deploy and monitor first few runs in production
- [ ] Verify posts are being ingested correctly
- [ ] Verify campaign processing still works with pre-ingested posts
- [ ] Check Vercel function invocation logs

**Monitoring:**
- [ ] Monitor ingestion logs for errors
- [ ] Verify post count increases over time
- [ ] Check for duplicate posts (should be handled by DB constraints)
- [ ] Monitor API costs (OpenAI for scoring)

**Deployment:**
- [ ] Deploy to production during low-traffic time
- [ ] Monitor first 24 hours closely
- [ ] Adjust cron frequency if needed

---

### Phase 4: Workflow-Based Processing (Week 4-5)

**Goal:** Migrate from single function to 8-step workflow for better reliability

#### Tasks - Setup:
- [ ] Install Vercel Workflow SDK: `npm install workflow`
- [ ] Read Vercel Workflow documentation
- [ ] Understand `"use workflow"` and `"use step"` directives

#### Tasks - Workflow Implementation:
- [ ] Create `src/lib/workflows/process-rss-workflow.ts`
- [ ] Implement 8-step workflow structure:
  - [ ] Step 1: Setup campaign
  - [ ] Step 2: Generate primary articles
  - [ ] Step 3: Fact-check primary
  - [ ] Step 4: Generate secondary articles
  - [ ] Step 5: Fact-check secondary
  - [ ] Step 6: Populate events
  - [ ] Step 7: Generate road work
  - [ ] Step 8: Finalize campaign
- [ ] Add detailed logging for each step
- [ ] Implement error handling

#### Tasks - Trigger:
- [ ] Create `/api/cron/trigger-workflow` endpoint
- [ ] Update `ScheduleChecker` to remove multi-tenant logic
- [ ] Add cron schedule (`*/5 * * * *`) to `vercel.json`
- [ ] Set workflow `maxDuration: 800` per step

#### Tasks - Testing:
- [ ] Test workflow locally (if possible)
- [ ] Test manual trigger with secret parameter
- [ ] Deploy to production
- [ ] Test first scheduled run
- [ ] Monitor Vercel logs for step progress
- [ ] Verify campaign completes successfully

**Gradual Migration:**
- [ ] Keep old `/api/cron/rss-processing` as backup
- [ ] Run both systems in parallel for 1 week
- [ ] Compare results (campaign quality, timing, errors)
- [ ] Once confident, disable old system
- [ ] Delete old endpoint after 2 weeks

**Monitoring:**
- [ ] Check workflow execution logs in Vercel
- [ ] Verify each step completes within 800s timeout
- [ ] Monitor total workflow duration
- [ ] Check for any step failures
- [ ] Verify campaigns still generate correctly

**Rollback Plan:**
- [ ] If workflow fails, revert to old system
- [ ] Document issues encountered
- [ ] Fix issues in development
- [ ] Retry workflow migration

---

### Phase 5: Testing & Validation (Week 6)

**Goal:** Comprehensive testing of entire new system

#### Integration Tests:
- [ ] Test complete RSS ingestion → workflow → campaign → preview → send flow
- [ ] Verify AI prompts work correctly in production
- [ ] Test OpenAI and Claude providers (if both configured)
- [ ] Verify testing playground works with real data
- [ ] Test multiple campaigns in sequence

#### Load Tests:
- [ ] Verify workflow doesn't timeout under normal load
- [ ] Test with large number of RSS posts (100+)
- [ ] Verify event population handles many events
- [ ] Test road work generation with multiple sources

#### User Acceptance Testing:
- [ ] Have user test AI prompt editing
- [ ] Have user test testing playground
- [ ] Have user test workflow progress visibility
- [ ] Gather feedback on UX improvements

#### Edge Cases:
- [ ] Test with no RSS posts available
- [ ] Test with all low-scoring articles
- [ ] Test with missing events
- [ ] Test with failed road work generation
- [ ] Verify graceful degradation

---

### Phase 6: Documentation & Cleanup (Week 7)

**Goal:** Document new system and clean up old code

#### Documentation:
- [ ] Update CLAUDE.md with new system architecture
- [ ] Document AI prompt management process
- [ ] Document testing playground usage
- [ ] Document workflow structure and debugging
- [ ] Create troubleshooting guide for common issues

#### Cleanup:
- [ ] Remove deprecated `/api/cron/rss-processing` endpoint
- [ ] Remove old hardcoded prompt references
- [ ] Clean up unused API endpoints
- [ ] Remove debug endpoints no longer needed
- [ ] Archive old implementation code

#### Optimization:
- [ ] Review and optimize database queries
- [ ] Review and optimize AI API calls
- [ ] Monitor and reduce Vercel function costs
- [ ] Identify and fix any performance bottlenecks

---

## Success Criteria

### Phase 1: AI Prompt Architecture
- ✅ All editable prompts stored in database as complete JSON API requests
- ✅ AI provider selection works (OpenAI and Claude)
- ✅ `callAIWithPrompt()` successfully calls both providers
- ✅ Backward compatibility maintained with existing system

### Phase 2: Settings & Testing
- ✅ Settings page allows easy editing of AI prompts
- ✅ Testing playground enables testing with single or multiple posts
- ✅ Test results display all relevant information
- ✅ User feedback indicates improved UX

### Phase 3: RSS Ingestion
- ✅ RSS ingestion runs on chosen schedule (hourly or every 4 hours)
- ✅ New posts appear in database consistently
- ✅ Campaign processing successfully uses pre-ingested posts
- ✅ No increase in errors or failures

### Phase 4: Workflow Processing
- ✅ 8-step workflow completes successfully
- ✅ Each step logs progress clearly
- ✅ Workflow completes within total timeout (6400s / 106 min)
- ✅ Campaigns generate correctly with all sections
- ✅ No degradation in newsletter quality

### Phase 5: Testing & Validation
- ✅ All integration tests pass
- ✅ No timeouts or failures under normal load
- ✅ User acceptance testing passes
- ✅ Edge cases handled gracefully

### Phase 6: Documentation & Cleanup
- ✅ All documentation updated
- ✅ Old code removed and archived
- ✅ System optimized for performance and cost
- ✅ Team trained on new system

---

## Conclusion

This adaptation plan takes the sophisticated multi-newsletter workflow architecture and simplifies it for St. Cloud Scoop's single-newsletter local news system. Key adaptations include:

1. **Simplified Architecture:** Removed multi-tenant complexity (no `newsletter_id` filtering)
2. **Enhanced AI Management:** Complete JSON API request storage with OpenAI/Claude provider selection
3. **Improved Testing:** Dedicated testing playground for safe experimentation
4. **Better Reliability:** Separate RSS ingestion + 8-step workflow for better timeout handling
5. **St. Cloud-Specific:** Maintained newsletter structure (Primary, Secondary, Events, Road Work)

**Timeline:** 6-7 weeks for complete implementation
**Risk Level:** Low (gradual migration with rollback plans)
**Expected Benefits:** More reliable newsletter generation, easier AI prompt management, better debugging visibility

---

**END OF MIGRATION PLAN**
