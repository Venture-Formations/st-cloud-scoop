# Newsletter System Migration Guide: Workflow & AI Architecture

**Purpose:** Migrate another newsletter system to use the same AI prompt architecture and workflow-based processing

**Date:** 2025-01-22

---

## Table of Contents

1. [AI Prompt Architecture](#ai-prompt-architecture)
2. [Settings > AI Prompts Page](#settings--ai-prompts-page)
3. [AI Prompt Testing Playground](#ai-prompt-testing-playground)
4. [RSS Ingestion Every 15 Minutes](#rss-ingestion-every-15-minutes)
5. [Workflow-Based Newsletter Processing](#workflow-based-newsletter-processing)
6. [Implementation Checklist](#implementation-checklist)

---

## AI Prompt Architecture

### Core Concept: Complete JSON API Requests in Database

**CRITICAL:** ALL AI prompts are stored as **complete JSON API requests** in the `app_settings` table. No parameters should be hardcoded in application code.

### Database Structure

```sql
app_settings (
  key TEXT,               -- e.g. 'ai_prompt_primary_article_title'
  value JSONB,            -- Complete JSON API request
  ai_provider TEXT,       -- 'openai' or 'claude'
  newsletter_id TEXT      -- Multi-tenant isolation
)
```

### Example Prompt in Database

**Key:** `ai_prompt_primary_article_title`

**Value (JSONB):**
```json
{
  "model": "gpt-4o",
  "temperature": 0.7,
  "max_output_tokens": 500,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "ArticleTitle",
      "schema": {
        "type": "object",
        "properties": {
          "headline": { "type": "string" }
        },
        "required": ["headline"],
        "additionalProperties": false
      },
      "strict": true
    }
  },
  "messages": [
    {
      "role": "system",
      "content": "You are a headline writer for a newsletter about accounting and AI..."
    },
    {
      "role": "user",
      "content": "Title: {{title}}\nDescription: {{description}}\nContent: {{content}}\n\nWrite a compelling headline."
    }
  ]
}
```

**AI Provider:** `openai`

### Placeholder System

Prompts use placeholders that are replaced with actual content at runtime:

- `{{title}}` - Article title/headline
- `{{description}}` - Article description/summary
- `{{content}}` - Full article text
- `{{url}}` - Article source URL

### Standard Pattern: Use `callAIWithPrompt()`

**✅ CORRECT - Always use this pattern:**

```typescript
import { callAIWithPrompt } from '@/lib/openai'

// Example: Generate article title
const result = await callAIWithPrompt(
  'ai_prompt_primary_article_title',  // Key in app_settings
  newsletterId,                        // Newsletter ID for multi-tenant
  {
    title: post.title,
    description: post.description,
    content: post.full_article_text
  }
)

// result = { headline: "Your Generated Title" }
```

**❌ WRONG - Never hardcode parameters:**

```typescript
// FORBIDDEN: Hardcoding parameters
const response = await openai.responses.create({
  model: 'gpt-4o',           // ❌ Hardcoded
  temperature: 0.7,           // ❌ Hardcoded
  max_output_tokens: 1000,    // ❌ Hardcoded
  messages: [...]
})
```

### Implementation: `callAIWithPrompt()` Function

**Location:** `src/lib/openai.ts`

```typescript
export async function callAIWithPrompt(
  promptKey: string,
  newsletterId: string,
  placeholders: Record<string, string> = {},
  fallbackText?: string
): Promise<any> {
  // Load complete JSON prompt from database
  const promptJSON = await getPromptJSON(promptKey, newsletterId, fallbackText)

  // Extract provider info
  const provider = promptJSON._provider || 'openai'

  // Remove internal fields before sending to API
  delete promptJSON._provider

  // Call AI with complete structured prompt
  return await callWithStructuredPrompt(promptJSON, placeholders, provider, promptKey)
}
```

### Implementation: `getPromptJSON()` Function

**Location:** `src/lib/openai.ts`

```typescript
async function getPromptJSON(key: string, newsletterId: string, fallbackText?: string): Promise<any> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('value, ai_provider')
      .eq('newsletter_id', newsletterId)
      .eq('key', key)
      .single()

    if (error || !data) {
      console.warn(`⚠️  [AI-PROMPT] FALLBACK USED: ${key} (not found in database)`)

      if (!fallbackText) {
        throw new Error(`Prompt ${key} not found and no fallback provided`)
      }

      // Wrap fallback text in minimal JSON structure
      return {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: fallbackText }],
        _provider: 'openai'
      }
    }

    // Parse value - must be valid structured JSON
    let promptJSON: any
    if (typeof data.value === 'string') {
      try {
        promptJSON = JSON.parse(data.value)
      } catch (parseError) {
        throw new Error(`Prompt ${key} is not valid JSON`)
      }
    } else if (typeof data.value === 'object' && data.value !== null) {
      // Already an object (JSONB was auto-parsed)
      promptJSON = data.value
    } else {
      throw new Error(`Prompt ${key} has invalid format`)
    }

    // Validate structure - must have messages array
    if (!promptJSON.messages && !promptJSON.input) {
      throw new Error(`Prompt ${key} is missing 'messages' or 'input' array`)
    }

    if (promptJSON.messages && !Array.isArray(promptJSON.messages)) {
      throw new Error(`Prompt ${key} has 'messages' but it's not an array`)
    }

    // Normalize: Convert 'input' to 'messages' if needed
    if (promptJSON.input && !promptJSON.messages) {
      promptJSON.messages = promptJSON.input
    }

    // Add provider info for routing
    const provider = (data.ai_provider === 'claude' ? 'claude' : 'openai') as 'openai' | 'claude'
    promptJSON._provider = provider

    return promptJSON
  } catch (error) {
    console.error(`❌ [AI-PROMPT] ERROR fetching ${key}:`, error)

    if (!fallbackText) {
      throw error
    }

    // Return fallback wrapped in minimal JSON
    return {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: fallbackText }],
      _provider: 'openai'
    }
  }
}
```

### Key Principles

1. **Complete Prompts in Database:** Every prompt includes model, temperature, max_output_tokens, response_format, messages, etc.
2. **No Hardcoded Parameters:** All AI parameters come from database
3. **Placeholder Replacement:** Use `{{placeholder}}` syntax for dynamic content
4. **Provider Flexibility:** Support both OpenAI and Claude via `ai_provider` field
5. **Multi-tenant Isolation:** Filter by `newsletter_id` for all queries

---

## Settings > AI Prompts Page

### Overview

The Settings > AI Prompts page provides a UI for managing all AI prompts in the system. Each prompt can be edited, tested, reset to default, or saved as a custom default.

**URL:** `/dashboard/[slug]/settings` → "AI Prompts" tab

### Features

1. **View All Prompts:** Grouped by category (Primary, Secondary, Other)
2. **Edit Prompt:** Open editor popup with JSON textarea
3. **AI Provider Selection:** Choose OpenAI or Claude
4. **Test Prompt:** Test with real RSS post data
5. **Reset to Default:** Restore original/custom default
6. **Save as Default:** Save current version as custom default
7. **RSS Post Selector:** Select sample post for testing

### Edit Prompt Popup

**Location:** `src/app/dashboard/[slug]/settings/page.tsx` (lines 2148-3037)

**Key Components:**

#### 1. Edit Prompt Button

```typescript
<button
  onClick={() => handleEdit(prompt)}
  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
>
  Edit Prompt
</button>
```

#### 2. Edit Mode UI

When editing, the popup displays:

- **AI Provider Selector:** Toggle between OpenAI and Claude
- **JSON Textarea:** Full prompt JSON (15 rows, monospace font)
- **Character Count:** Display current length
- **Test Prompt Button:** Test without saving
- **Cancel Button:** Discard changes
- **Save Changes Button:** Save to database

```typescript
{isEditing ? (
  <>
    {/* AI Provider Selector */}
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        AI Provider
      </label>
      <div className="flex gap-4">
        <button
          onClick={() => editingPrompt && setEditingPrompt({ ...editingPrompt, ai_provider: 'openai' })}
          className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
            editingPrompt?.ai_provider === 'openai'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
          }`}
        >
          OpenAI
        </button>
        <button
          onClick={() => editingPrompt && setEditingPrompt({ ...editingPrompt, ai_provider: 'claude' })}
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

    <textarea
      value={editingPrompt?.value || ''}
      onChange={(e) => editingPrompt && setEditingPrompt({ ...editingPrompt, value: e.target.value })}
      rows={15}
      className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    <div className="mt-3 flex items-center justify-between">
      <button
        onClick={() => handleTestPrompt(prompt.key)}
        className="px-4 py-2 text-sm font-medium text-purple-700 bg-white border border-purple-300 rounded-md hover:bg-purple-50"
      >
        Test Prompt
      </button>
      <div className="flex items-center space-x-3">
        <button
          onClick={handleCancel}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={() => handleSave(prompt.key)}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  </>
) : (
  // View mode...
)}
```

#### 3. Save Prompt Handler

```typescript
const handleSave = async (key: string) => {
  if (!editingPrompt || editingPrompt.key !== key) return

  setSaving(key)
  setMessage('')

  try {
    const response = await fetch('/api/settings/ai-prompts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: editingPrompt.key,
        value: editingPrompt.value,
        ai_provider: editingPrompt.ai_provider
      })
    })

    if (response.ok) {
      setMessage('Prompt saved successfully!')
      setEditingPrompt(null)
      await loadPrompts()
      setTimeout(() => setMessage(''), 3000)
    } else {
      throw new Error('Failed to save prompt')
    }
  } catch (error) {
    setMessage('Error: Failed to save prompt')
    setTimeout(() => setMessage(''), 5000)
  } finally {
    setSaving(null)
  }
}
```

#### 4. Test Prompt Handler

```typescript
const handleTestPrompt = async (key: string) => {
  // Get the prompt's expected outputs
  const prompt = prompts.find(p => p.key === key)
  const expectedOutputs = prompt?.expected_outputs || null

  // Map prompt keys to their test endpoint type parameter
  const promptTypeMap: Record<string, string> = {
    'ai_prompt_primary_article_title': 'primaryArticleTitle',
    'ai_prompt_primary_article_body': 'primaryArticleBody',
    'ai_prompt_secondary_article_title': 'secondaryArticleTitle',
    'ai_prompt_secondary_article_body': 'secondaryArticleBody',
    // ... more mappings
  }

  let testType = promptTypeMap[key]

  if (!testType) {
    alert('Test not available for this prompt type')
    return
  }

  // Determine which RSS post to use
  let rssPostId = selectedPrimaryRssPost
  if (key.startsWith('ai_prompt_secondary_')) {
    rssPostId = selectedSecondaryRssPost
  }

  // Open modal and fetch results
  setTestModalOpen(true)
  setTestLoading(true)
  setTestError(null)
  setTestResults(null)

  try {
    let testUrl = `/api/debug/test-ai-prompts?type=${testType}&promptKey=${key}`
    if (rssPostId) {
      testUrl += `&rssPostId=${rssPostId}`
    }

    // If currently editing, use the current content from text box
    if (editingPrompt?.key === key && editingPrompt?.value) {
      testUrl += `&promptContent=${encodeURIComponent(editingPrompt.value)}`
      if (editingPrompt.ai_provider) {
        testUrl += `&provider=${editingPrompt.ai_provider}`
      }
    }

    const response = await fetch(testUrl)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Test failed')
    }

    setTestResults(data)
  } catch (error: any) {
    setTestError(error.message || 'Failed to run test')
  } finally {
    setTestLoading(false)
  }
}
```

#### 5. Reset to Default Handler

```typescript
const handleReset = async (key: string) => {
  if (!confirm('Are you sure you want to reset this prompt to its default value? This cannot be undone.')) {
    return
  }

  setSaving(key)
  setMessage('')

  try {
    const response = await fetch('/api/settings/ai-prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    })

    if (response.ok) {
      const data = await response.json()
      const message = data.used_custom_default
        ? 'Prompt reset to your custom default!'
        : 'Prompt reset to original code default!'
      setMessage(message)
      await loadPrompts()
      setTimeout(() => setMessage(''), 3000)
    } else {
      throw new Error('Failed to reset prompt')
    }
  } catch (error) {
    setMessage('Error: Failed to reset prompt')
    setTimeout(() => setMessage(''), 5000)
  } finally {
    setSaving(null)
  }
}
```

#### 6. Save as Default Handler

```typescript
const handleSaveAsDefault = async (key: string) => {
  if (!confirm('Are you sure you want to save the current prompt as your custom default?\n\nThis will replace any previous custom default. When you click "Reset to Default", it will restore to this version instead of the original code default.')) {
    return
  }

  if (!confirm('Double confirmation: Save current prompt as default? This action will be permanent.')) {
    return
  }

  setSaving(key)
  setMessage('')

  try {
    const response = await fetch('/api/settings/ai-prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, action: 'save_as_default' })
    })

    if (response.ok) {
      setMessage('✓ Current prompt saved as your custom default!')
      await loadPrompts()
      setTimeout(() => setMessage(''), 3000)
    } else {
      throw new Error('Failed to save as default')
    }
  } catch (error) {
    setMessage('Error: Failed to save as default')
    setTimeout(() => setMessage(''), 5000)
  } finally {
    setSaving(null)
  }
}
```

### API Endpoints

#### `GET /api/settings/ai-prompts`

Load all prompts from database:

```typescript
// Returns:
{
  prompts: [
    {
      key: 'ai_prompt_primary_article_title',
      name: 'Primary Article Title',
      description: 'Generate titles for primary articles',
      value: { /* complete JSON */ },
      ai_provider: 'openai',
      category: 'Primary Article Generation'
    },
    // ... more prompts
  ],
  grouped: {
    'Primary Article Generation': [ /* prompts */ ],
    'Secondary Article Generation': [ /* prompts */ ],
    // ... more categories
  }
}
```

#### `PATCH /api/settings/ai-prompts`

Save prompt changes:

```typescript
// Request:
{
  key: 'ai_prompt_primary_article_title',
  value: '{ "model": "gpt-4o", ... }',  // JSON string
  ai_provider: 'openai'
}

// Updates app_settings:
UPDATE app_settings
SET value = $1, ai_provider = $2, updated_at = NOW()
WHERE key = $3 AND newsletter_id = $4
```

#### `POST /api/settings/ai-prompts`

Reset to default OR save as default:

```typescript
// Reset to default:
{
  key: 'ai_prompt_primary_article_title'
}

// Save as default:
{
  key: 'ai_prompt_primary_article_title',
  action: 'save_as_default'
}
```

---

## AI Prompt Testing Playground

### Overview

A dedicated testing page for experimenting with AI prompts without affecting live prompts.

**URL:** `/dashboard/[slug]/settings/AIPromptTesting`

**Location:** `src/app/dashboard/[slug]/settings/AIPromptTesting/page.tsx`

### Features

1. **AI Provider Selection:** Toggle between OpenAI and Claude
2. **Prompt Type Selector:** Choose from Primary Title, Primary Body, Secondary Title, Secondary Body, Post Scorer, Subject Line, Custom
3. **RSS Post Selector:** Choose sample post from recent feeds
4. **JSON Editor:** Full control over complete API request
5. **Live Prompt Loading:** Auto-loads current live prompt from database
6. **Saved Prompts:** Auto-saves prompts to `ai_prompt_tests` table
7. **Test Single Post:** Test with one RSS post
8. **Test Multiple Posts:** Test with 10 RSS posts at once
9. **Response Display:** View parsed response, full API response, source posts
10. **Test History:** See all past test runs in current session

### Key Components

#### 1. Provider & Prompt Type Selectors

```typescript
<div className="flex gap-4">
  <button
    onClick={() => setProvider('openai')}
    className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
      provider === 'openai'
        ? 'border-blue-500 bg-blue-50 text-blue-700'
        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
    }`}
  >
    OpenAI
  </button>
  <button
    onClick={() => setProvider('claude')}
    className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
      provider === 'claude'
        ? 'border-purple-500 bg-purple-50 text-purple-700'
        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
    }`}
  >
    Claude
  </button>
</div>

<select
  value={promptType}
  onChange={(e) => setPromptType(e.target.value as PromptType)}
  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
>
  <optgroup label="Primary Section">
    <option value="primary-title">Primary Article Title</option>
    <option value="primary-body">Primary Article Body</option>
  </optgroup>
  <optgroup label="Secondary Section">
    <option value="secondary-title">Secondary Article Title</option>
    <option value="secondary-body">Secondary Article Body</option>
  </optgroup>
  <optgroup label="Other">
    <option value="post-scorer">Post Scorer/Evaluator</option>
    <option value="subject-line">Subject Line Generator</option>
    <option value="custom">Custom/Freeform</option>
  </optgroup>
</select>
```

#### 2. Live Prompt Loading

Automatically loads the current live prompt when provider/promptType changes:

```typescript
useEffect(() => {
  loadSavedPromptOrTemplate()
}, [provider, promptType])

async function loadSavedPromptOrTemplate() {
  // STEP 1: Try to load LIVE prompt first (from app_settings)
  try {
    const res = await fetch(
      `/api/ai/load-live-prompt?newsletter_id=${slug}&provider=${provider}&prompt_type=${promptType}`
    )
    const data = await res.json()

    if (data.success && data.data?.prompt) {
      console.log('[Frontend] Loaded live prompt from app_settings')

      const providerMatches = data.data.provider_matches || false
      setLivePromptProviderMatches(providerMatches)

      const promptToSet = data.data.prompt
      setLivePrompt(promptToSet)

      // ONLY set the prompt if the provider matches
      if (providerMatches) {
        setPrompt(promptToSet)
        setSavedPromptInfo(null)
        return
      }
    }
  } catch (error) {
    console.error('[Frontend] Error loading live prompt:', error)
  }

  // STEP 2: Try to load saved prompt from database (ai_prompt_tests table)
  try {
    const res = await fetch(
      `/api/ai/load-prompt?newsletter_id=${slug}&provider=${provider}&prompt_type=${promptType}`
    )
    const data = await res.json()

    if (data.success && data.data) {
      setSavedPromptInfo(data.data)
      setPrompt(data.data.prompt)
      setLivePrompt(null)
      return
    }
  } catch (error) {
    console.error('[Frontend] Error loading saved prompt:', error)
  }

  // STEP 3: Load template
  setSavedPromptInfo(null)
  setLivePrompt(null)
  loadTemplate()
}
```

#### 3. Test Single Post

```typescript
async function handleTest() {
  if (!prompt.trim()) {
    alert('Please enter a prompt')
    return
  }

  // Validate JSON
  let promptJson
  try {
    promptJson = JSON.parse(prompt)
  } catch (error) {
    alert('Invalid JSON format. Please enter a valid JSON API request.')
    return
  }

  const selectedPost = recentPosts.find(p => p.id === selectedPostId)
  if (!selectedPost && promptType !== 'custom') {
    alert('Please select a post to test with')
    return
  }

  // Save the prompt
  savePrompt(prompt)

  setTesting(true)
  setCurrentResponse(null)

  try {
    const res = await fetch('/api/ai/test-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        promptJson,
        post: selectedPost
      })
    })

    const data = await res.json()

    if (data.success) {
      const result: TestResult = {
        timestamp: new Date(),
        provider: data.provider,
        model: data.model,
        promptType,
        response: data.response,
        tokensUsed: data.tokensUsed,
        duration: data.duration,
        apiRequest: data.apiRequest,
        fullApiResponse: data.fullApiResponse
      }

      setCurrentResponse(result)
      setTestHistory(prev => [result, ...prev])
      setShowModal(true)
    } else {
      alert(`Error: ${data.error}`)
    }
  } catch (error) {
    console.error('Test failed:', error)
    alert('Failed to test prompt')
  } finally {
    setTesting(false)
  }
}
```

#### 4. Test Multiple Posts (10 Articles)

```typescript
async function handleTestMultiple() {
  if (!prompt.trim()) {
    alert('Please enter a prompt')
    return
  }

  let promptJson
  try {
    promptJson = JSON.parse(prompt)
  } catch (error) {
    alert('Invalid JSON format.')
    return
  }

  if (recentPosts.length === 0) {
    alert('No posts available for testing')
    return
  }

  savePrompt(prompt)

  setTesting(true)
  setCurrentResponse(null)

  try {
    const res = await fetch('/api/ai/test-prompt-multiple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        promptJson,
        newsletter_id: slug,
        prompt_type: promptType,
        limit: 10
      })
    })

    const data = await res.json()

    if (data.success) {
      const result: TestResult = {
        timestamp: new Date(),
        provider: data.provider,
        model: data.model,
        promptType,
        response: data.responses?.[0] || 'No responses',
        tokensUsed: data.totalTokensUsed,
        duration: data.totalDuration,
        apiRequest: data.apiRequest,
        isMultiple: true,
        responses: data.responses,
        fullApiResponses: data.fullApiResponses,
        sourcePosts: data.sourcePosts
      }

      setCurrentResponse(result)
      setTestHistory(prev => [result, ...prev])
      setShowModal(true)
    } else {
      alert(`Error: ${data.error}`)
    }
  } catch (error) {
    console.error('Test multiple failed:', error)
    alert('Failed to test prompt for multiple articles')
  } finally {
    setTesting(false)
  }
}
```

#### 5. Results Modal

Displays:
- **API Call Details:** Exact JSON sent to API (collapsible)
- **Source Articles:** The RSS posts used for testing (collapsible, for multiple tests)
- **AI Responses:** Parsed responses for each article
- **Full API Responses:** Complete API response objects (collapsible, for debugging)
- **Metadata:** Provider, model, duration, tokens, timestamp

```typescript
{showModal && currentResponse && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      {/* Modal Header */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold">Test Results</h3>
        <p className="text-sm text-gray-600">
          {currentResponse.provider.toUpperCase()} • {currentResponse.model} • {currentResponse.duration}ms
          {currentResponse.tokensUsed && ` • ${currentResponse.tokensUsed} tokens`}
        </p>
      </div>

      {/* Modal Body */}
      <div className="p-6 overflow-y-auto flex-1 space-y-4">
        {/* API Call Details (Collapsible) */}
        <div className="border rounded-lg">
          <button onClick={() => setShowPromptDetails(!showPromptDetails)}>
            {showPromptDetails ? '▼' : '▶'} API Call Details
          </button>
          {showPromptDetails && (
            <pre>{JSON.stringify(currentResponse.apiRequest, null, 2)}</pre>
          )}
        </div>

        {/* Source Posts (for multiple article tests) */}
        {currentResponse.isMultiple && currentResponse.sourcePosts && (
          <div className="border rounded-lg">
            <button onClick={() => setShowSourcePosts(!showSourcePosts)}>
              {showSourcePosts ? '▼' : '▶'} Source Articles ({currentResponse.sourcePosts.length})
            </button>
            {showSourcePosts && (
              <div className="space-y-4">
                {currentResponse.sourcePosts.map((post, index) => (
                  <div key={post.id} className="border rounded-lg p-4">
                    <h5>Article {index + 1}</h5>
                    <p><strong>Title:</strong> {post.title}</p>
                    <p><strong>Description:</strong> {post.description}</p>
                    <p><strong>Content:</strong> {post.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Response Section */}
        <div className="border rounded-lg">
          <h4>AI Responses</h4>
          {currentResponse.isMultiple && currentResponse.responses ? (
            <div className="space-y-4">
              {currentResponse.responses.map((response, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <h5>Article {index + 1}</h5>
                  <pre>{JSON.stringify(response, null, 2)}</pre>
                </div>
              ))}
            </div>
          ) : (
            <pre>{JSON.stringify(currentResponse.response, null, 2)}</pre>
          )}
        </div>

        {/* Full API Responses (Collapsible) */}
        {currentResponse.fullApiResponses && (
          <div className="border rounded-lg">
            <button onClick={() => setShowFullApiResponses(!showFullApiResponses)}>
              {showFullApiResponses ? '▼' : '▶'} Full API Responses
            </button>
            {showFullApiResponses && (
              <div className="space-y-4">
                {currentResponse.fullApiResponses.map((resp, index) => (
                  <div key={index}>
                    <h5>Article {index + 1} - Full API Response</h5>
                    <pre>{JSON.stringify(resp, null, 2)}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Footer */}
      <div className="p-6 border-t flex justify-end">
        <button onClick={() => setShowModal(false)}>Close</button>
      </div>
    </div>
  </div>
)}
```

#### 6. Reference Guide

Provides quick reference for:
- Available placeholders
- Expected response formats for each prompt type
- Important notes about JSON structure

```typescript
<div className="bg-white rounded-lg shadow p-6">
  <h2>Quick Reference Guide</h2>

  {/* Placeholders */}
  <div className="mb-6">
    <h3>Available Placeholders</h3>
    <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
      <div><code>{{title}}</code> - Article title/headline</div>
      <div><code>{{description}}</code> - Article description/summary</div>
      <div><code>{{content}}</code> - Full article text</div>
      <div><code>{{url}}</code> - Article source URL</div>
    </div>
  </div>

  {/* Expected Response Formats */}
  <div className="mb-6">
    <h3>Expected Response Formats</h3>
    <div className="space-y-3 text-xs">
      <div>
        <div className="font-semibold">Primary/Secondary Title:</div>
        <pre>{"{\n  \"headline\": \"string\"\n}"}</pre>
      </div>
      <div>
        <div className="font-semibold">Primary/Secondary Body:</div>
        <pre>{"{\n  \"content\": \"string\",\n  \"word_count\": integer\n}"}</pre>
      </div>
      <div>
        <div className="font-semibold">Post Scorer:</div>
        <pre>{"{\n  \"score\": integer,\n  \"reasoning\": \"string\"\n}"}</pre>
      </div>
    </div>
  </div>

  {/* Important Note */}
  <div>
    <h3>Important</h3>
    <div className="bg-blue-50 border border-blue-200 rounded p-3">
      <p className="font-medium">Enter complete JSON API request:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>Include all parameters (model, messages, temperature, max_output_tokens, response_format)</li>
        <li>Use placeholders like <code>{{title}}</code>, <code>{{content}}</code></li>
        <li>JSON is sent to API exactly as-is (only placeholders replaced)</li>
        <li>For OpenAI: Use <code>max_output_tokens</code> (not max_tokens)</li>
      </ul>
    </div>
  </div>
</div>
```

### API Endpoints

#### `GET /api/ai/load-live-prompt`

Load current live prompt from `app_settings`:

```typescript
// Query params:
// - newsletter_id: Newsletter slug
// - provider: 'openai' or 'claude'
// - prompt_type: 'primary-title', 'primary-body', etc.

// Returns:
{
  success: true,
  data: {
    prompt: '{ "model": "gpt-4o", ... }',  // Complete JSON
    provider_matches: true  // Whether ai_provider matches selected provider
  }
}
```

#### `GET /api/ai/load-prompt`

Load saved test prompt from `ai_prompt_tests` table:

```typescript
// Returns:
{
  success: true,
  data: {
    id: 'abc123',
    prompt: '{ "model": "gpt-4o", ... }',
    updated_at: '2025-01-22T10:00:00Z'
  }
}
```

#### `POST /api/ai/save-prompt`

Save prompt to `ai_prompt_tests` table:

```typescript
// Request:
{
  newsletter_id: 'accounting',
  provider: 'openai',
  model: 'gpt-4o',
  prompt_type: 'primary-title',
  prompt: '{ "model": "gpt-4o", ... }'
}

// Upserts to ai_prompt_tests table
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

// Returns:
{
  success: true,
  provider: 'openai',
  model: 'gpt-4o',
  response: { headline: '...' },
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
  newsletter_id: 'accounting',
  prompt_type: 'primary-title',
  limit: 10
}

// Returns:
{
  success: true,
  provider: 'openai',
  model: 'gpt-4o',
  responses: [
    { headline: 'Article 1 Title' },
    { headline: 'Article 2 Title' },
    // ... 10 responses
  ],
  totalTokensUsed: 2500,
  totalDuration: 15000,
  apiRequest: { /* exact request sent */ },
  fullApiResponses: [ /* 10 complete API responses */ ],
  sourcePosts: [
    { id: 'post1', title: '...', description: '...', content: '...' },
    // ... 10 posts
  ]
}
```

---

## RSS Ingestion Every 15 Minutes

### Overview

RSS feeds are ingested every 15 minutes to ensure fresh content is always available for newsletter processing.

### Cron Configuration

**Location:** `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest-rss",
      "schedule": "*/15 * * * *"
    }
  ],
  "functions": {
    "app/api/cron/ingest-rss/route.ts": {
      "maxDuration": 300
    }
  }
}
```

**Schedule:** `*/15 * * * *` = Every 15 minutes

**Max Duration:** 300 seconds (5 minutes)

### Cron Endpoint

**Location:** `src/app/api/cron/ingest-rss/route.ts`

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

    // Get all active RSS feeds
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

    console.log(`[RSS Ingest] Processing ${feeds.length} active feeds`)

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

export const maxDuration = 300
```

### Why Every 15 Minutes?

1. **Fresh Content:** Ensures latest articles available for processing
2. **Timely Scoring:** New posts scored quickly for newsletter selection
3. **Balanced Load:** Not too frequent (every 5 min) to overload, not too slow (hourly) to miss content
4. **Cost Efficient:** Reasonable API usage while maintaining freshness

---

## Workflow-Based Newsletter Processing

### Overview

Newsletter processing was migrated from a single long-running function to a **Vercel Workflow** with 10 separate steps. This provides:

1. **Better timeout management:** Each step has 800-second timeout
2. **Improved reliability:** Steps can retry independently
3. **Progress visibility:** Clear logging per step
4. **Easier debugging:** Failures isolated to specific steps

### Architecture Comparison

#### ❌ OLD: Single Function (Deprecated)

```
/api/rss/process
  └── All steps in one function (600s timeout)
      - Create campaign
      - Fetch RSS
      - Extract full text
      - Score posts
      - Generate articles
      - Finalize
```

**Problems:**
- Timeout at 600s for everything
- No way to see progress mid-execution
- If one step fails, entire process fails
- Hard to debug

#### ✅ NEW: Workflow (10 Steps)

```
/api/cron/trigger-workflow (runs every 5 min)
  └── Checks schedule for each newsletter
      └── If time matches, starts workflow:
          workflow/process-rss-workflow.ts
            ├── Step 1:  Setup + Deduplication
            ├── Step 2:  Generate 6 primary titles
            ├── Step 3:  Generate 3 primary bodies (batch 1)
            ├── Step 4:  Generate 3 primary bodies (batch 2)
            ├── Step 5:  Fact-check all 6 primary articles
            ├── Step 6:  Generate 6 secondary titles
            ├── Step 7:  Generate 3 secondary bodies (batch 1)
            ├── Step 8:  Generate 3 secondary bodies (batch 2)
            ├── Step 9:  Fact-check all 6 secondary articles
            └── Step 10: Finalize
```

**Benefits:**
- Each step: 800s timeout
- Clear progress logging
- Steps retry independently
- Easy to debug specific steps

### Trigger Endpoint

**Location:** `src/app/api/cron/trigger-workflow/route.ts`

**Schedule:** `*/5 * * * *` (every 5 minutes)

**Purpose:** Check if it's time to run RSS processing for any newsletter based on their individual schedules.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { ScheduleChecker } from '@/lib/schedule-checker'
import { start } from 'workflow/api'
import { processRSSWorkflow } from '@/lib/workflows/process-rss-workflow'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Workflow Trigger Cron
 * Runs every 5 minutes to check if it's time to execute the RSS workflow
 * for any newsletter based on their individual schedules
 *
 * Multi-tenant: Each newsletter has its own schedule in app_settings
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

    // Get all active newsletters
    const { data: newsletters, error: newslettersError } = await supabaseAdmin
      .from('newsletters')
      .select('id, name, slug')
      .eq('is_active', true)

    if (newslettersError || !newsletters || newsletters.length === 0) {
      console.log('[Workflow Trigger] No active newsletters found')
      return NextResponse.json({
        success: true,
        message: 'No active newsletters',
        skipped: true,
        timestamp: new Date().toISOString()
      })
    }

    console.log(`[Workflow Trigger] Checking schedules for ${newsletters.length} newsletters`)

    // Check each newsletter's schedule and start workflows as needed
    const startedWorkflows: string[] = []

    for (const newsletter of newsletters) {
      const shouldRun = await ScheduleChecker.shouldRunRSSProcessing(newsletter.id)

      if (shouldRun) {
        console.log(`[Workflow Trigger] Starting workflow for ${newsletter.name} (${newsletter.id})`)

        await start(processRSSWorkflow, [{
          trigger: 'cron',
          newsletter_id: newsletter.id
        }])

        startedWorkflows.push(newsletter.name)
      } else {
        console.log(`[Workflow Trigger] Not time yet for ${newsletter.name}`)
      }
    }

    if (startedWorkflows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No workflows scheduled at this time',
        skipped: true,
        timestamp: new Date().toISOString()
      })
    }

    console.log(`[Workflow Trigger] Started workflows for: ${startedWorkflows.join(', ')}`)

    return NextResponse.json({
      success: true,
      message: `Started ${startedWorkflows.length} workflow(s)`,
      newsletters: startedWorkflows,
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

### Schedule Checker

**Location:** `src/lib/schedule-checker.ts`

**Purpose:** Determine if it's time to run RSS processing based on newsletter-specific schedule settings.

```typescript
import { supabaseAdmin } from './supabase'

interface ScheduleSettings {
  reviewScheduleEnabled: boolean
  dailyScheduleEnabled: boolean
  rssProcessingTime: string
  campaignCreationTime: string
  scheduledSendTime: string
  dailyCampaignCreationTime: string
  dailyScheduledSendTime: string
}

export class ScheduleChecker {
  public static async getScheduleSettings(newsletterId: string): Promise<ScheduleSettings> {
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .eq('newsletter_id', newsletterId)
      .in('key', [
        'email_reviewScheduleEnabled',
        'email_dailyScheduleEnabled',
        'email_rssProcessingTime',
        'email_campaignCreationTime',
        'email_scheduledSendTime',
        'email_dailyCampaignCreationTime',
        'email_dailyScheduledSendTime'
      ])

    const settingsMap = (settings || []).reduce((acc, setting) => {
      acc[setting.key] = setting.value
      return acc
    }, {} as Record<string, string>)

    return {
      reviewScheduleEnabled: settingsMap['email_reviewScheduleEnabled'] === 'true',
      dailyScheduleEnabled: settingsMap['email_dailyScheduleEnabled'] === 'true',
      rssProcessingTime: settingsMap['email_rssProcessingTime'] || '20:30',
      campaignCreationTime: settingsMap['email_campaignCreationTime'] || '20:50',
      scheduledSendTime: settingsMap['email_scheduledSendTime'] || '21:00',
      dailyCampaignCreationTime: settingsMap['email_dailyCampaignCreationTime'] || '04:30',
      dailyScheduledSendTime: settingsMap['email_dailyScheduledSendTime'] || '04:55'
    }
  }

  public static getCurrentTimeInCT(): { hours: number, minutes: number, timeString: string } {
    // Get current time in Central Time
    const now = new Date()
    const centralTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}))
    const hours = centralTime.getHours()
    const minutes = centralTime.getMinutes()
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`

    return { hours, minutes, timeString }
  }

  public static parseTime(timeStr: string): { hours: number, minutes: number } {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return { hours, minutes }
  }

  private static isTimeToRun(currentTime: string, scheduledTime: string, lastRunKey: string, newsletterId: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      const current = this.parseTime(currentTime)
      const scheduled = this.parseTime(scheduledTime)

      // Check if current time matches scheduled time (within 4-minute window)
      const currentMinutes = current.hours * 60 + current.minutes
      const scheduledMinutes = scheduled.hours * 60 + scheduled.minutes
      const timeDiff = Math.abs(currentMinutes - scheduledMinutes)

      if (timeDiff > 4) {
        console.log(`Time window not matched for ${lastRunKey}: current ${currentTime}, scheduled ${scheduledTime}, diff ${timeDiff} minutes`)
        resolve(false)
        return
      }

      console.log(`Time window matched for ${lastRunKey}: current ${currentTime}, scheduled ${scheduledTime}, diff ${timeDiff} minutes`)

      // Update last run tracking
      try {
        const nowCentral = new Date().toLocaleString("en-US", {timeZone: "America/Chicago"})
        const centralDate = new Date(nowCentral)
        const today = centralDate.toISOString().split('T')[0]

        await supabaseAdmin
          .from('app_settings')
          .upsert({
            newsletter_id: newsletterId,
            key: lastRunKey,
            value: today,
            description: `Last run date for ${lastRunKey}`,
            updated_at: new Date().toISOString()
          })

        console.log(`${lastRunKey} running at ${currentTime} (last run tracking updated to ${today})`)
        resolve(true)
      } catch (error) {
        console.error(`Error updating last run for ${lastRunKey}:`, error)
        resolve(true)  // Still allow the run
      }
    })
  }

  static async shouldRunRSSProcessing(newsletterId: string): Promise<boolean> {
    try {
      const settings = await this.getScheduleSettings(newsletterId)

      if (!settings.reviewScheduleEnabled) {
        return false
      }

      const currentTime = this.getCurrentTimeInCT()
      console.log(`RSS Processing check: Current CT time ${currentTime.timeString}, Scheduled: ${settings.rssProcessingTime}`)

      return await this.isTimeToRun(
        currentTime.timeString,
        settings.rssProcessingTime,
        'last_rss_processing_run',
        newsletterId
      )
    } catch (error) {
      console.error('Error checking RSS processing schedule:', error)
      return false
    }
  }
}
```

### Workflow Implementation

**Location:** `src/lib/workflows/process-rss-workflow.ts`

**Structure:** 10-step workflow with Vercel Workflow SDK

```typescript
import { supabaseAdmin } from '@/lib/supabase'
import { RSSProcessor } from '@/lib/rss-processor'

/**
 * RSS Processing Workflow (REFACTORED)
 * Each step gets its own 800-second timeout
 *
 * NEW STRUCTURE:
 * Step 1:  Setup + Deduplication
 * Step 2:  Generate 6 primary titles (fast)
 * Step 3:  Generate 3 primary bodies (batch 1)
 * Step 4:  Generate 3 primary bodies (batch 2)
 * Step 5:  Fact-check all 6 primary articles
 * Step 6:  Generate 6 secondary titles (fast)
 * Step 7:  Generate 3 secondary bodies (batch 1)
 * Step 8:  Generate 3 secondary bodies (batch 2)
 * Step 9:  Fact-check all 6 secondary articles
 * Step 10: Finalize
 */
export async function processRSSWorkflow(input: {
  trigger: 'cron' | 'manual'
  newsletter_id: string
}) {
  "use workflow"

  let campaignId: string

  console.log(`[Workflow] Starting for newsletter: ${input.newsletter_id}`)

  // STEP 1: Setup - Create campaign, assign posts, deduplicate
  campaignId = await setupCampaign(input.newsletter_id)

  // PRIMARY SECTION
  // STEP 2: Generate all 6 primary titles (fast, batched)
  await generatePrimaryTitles(campaignId)

  // STEP 3-4: Generate primary bodies in 2 batches (3 articles each)
  await generatePrimaryBodiesBatch1(campaignId)
  await generatePrimaryBodiesBatch2(campaignId)

  // STEP 5: Fact-check all primary articles
  await factCheckPrimary(campaignId)

  // SECONDARY SECTION
  // STEP 6: Generate all 6 secondary titles (fast, batched)
  await generateSecondaryTitles(campaignId)

  // STEP 7-8: Generate secondary bodies in 2 batches (3 articles each)
  await generateSecondaryBodiesBatch1(campaignId)
  await generateSecondaryBodiesBatch2(campaignId)

  // STEP 9: Fact-check all secondary articles
  await factCheckSecondary(campaignId)

  // STEP 10: Finalize
  await finalizeCampaign(campaignId)

  console.log('=== WORKFLOW COMPLETE ===')

  return { campaignId, success: true }
}

// Step functions
async function setupCampaign(newsletterId: string) {
  "use step"

  console.log('[Workflow Step 1/10] Setting up campaign...')

  const processor = new RSSProcessor()

  // Get the newsletter
  const { data: newsletter, error: newsletterError } = await supabaseAdmin
    .from('newsletters')
    .select('id, name, slug')
    .eq('id', newsletterId)
    .single()

  if (newsletterError || !newsletter) {
    throw new Error(`Newsletter not found: ${newsletterId}`)
  }

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
      status: 'processing',
      newsletter_id: newsletter.id
    }])
    .select('id')
    .single()

  if (createError || !newCampaign) {
    throw new Error('Failed to create campaign')
  }

  const id = newCampaign.id
  console.log(`[Workflow Step 1/10] Campaign created: ${id} for ${campaignDate}`)

  // Select AI apps and prompts
  try {
    const { AppSelector } = await import('@/lib/app-selector')
    const { PromptSelector } = await import('@/lib/prompt-selector')

    await AppSelector.selectAppsForCampaign(id, newsletter.id)
    await PromptSelector.selectPromptForCampaign(id)
  } catch (error) {
    console.log('[Workflow Step 1/10] AI selection failed (non-critical)')
  }

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

  // Get lookback window
  const { data: lookbackSetting } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('newsletter_id', newsletterId)
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

  console.log(`[Workflow Step 1/10] Assigned ${topPrimary.length} primary, ${topSecondary.length} secondary posts`)

  // Deduplicate
  const dedupeResult = await processor.handleDuplicatesForCampaign(id)
  console.log(`[Workflow Step 1/10] Deduplication: ${dedupeResult.groups} groups, ${dedupeResult.duplicates} duplicate posts found`)
  console.log('[Workflow Step 1/10] ✓ Setup complete')

  return id
}

// PRIMARY SECTION
async function generatePrimaryTitles(campaignId: string) {
  "use step"

  console.log('[Workflow Step 2/10] Generating 6 primary titles...')
  const processor = new RSSProcessor()
  await processor.generateTitlesOnly(campaignId, 'primary', 6)

  const { data: articles } = await supabaseAdmin
    .from('articles')
    .select('id, headline')
    .eq('campaign_id', campaignId)
    .not('headline', 'is', null)

  console.log(`[Workflow Step 2/10] ✓ Generated ${articles?.length || 0} primary titles`)
}

async function generatePrimaryBodiesBatch1(campaignId: string) {
  "use step"

  console.log('[Workflow Step 3/10] Generating 3 primary bodies (batch 1)...')
  const processor = new RSSProcessor()
  await processor.generateBodiesOnly(campaignId, 'primary', 0, 3)

  const { data: articles } = await supabaseAdmin
    .from('articles')
    .select('id, content')
    .eq('campaign_id', campaignId)
    .not('content', 'is', null)

  console.log(`[Workflow Step 3/10] ✓ Total bodies generated: ${articles?.length || 0}`)
}

async function generatePrimaryBodiesBatch2(campaignId: string) {
  "use step"

  console.log('[Workflow Step 4/10] Generating 3 more primary bodies (batch 2)...')
  const processor = new RSSProcessor()
  await processor.generateBodiesOnly(campaignId, 'primary', 3, 3)

  const { data: articles } = await supabaseAdmin
    .from('articles')
    .select('id, content')
    .eq('campaign_id', campaignId)
    .not('content', 'is', null)

  console.log(`[Workflow Step 4/10] ✓ Total primary bodies: ${articles?.length || 0}`)
}

async function factCheckPrimary(campaignId: string) {
  "use step"

  console.log('[Workflow Step 5/10] Fact-checking all primary articles...')
  const processor = new RSSProcessor()
  await processor.factCheckArticles(campaignId, 'primary')

  const { data: articles } = await supabaseAdmin
    .from('articles')
    .select('id, fact_check_score')
    .eq('campaign_id', campaignId)
    .not('fact_check_score', 'is', null)

  const avgScore = (articles?.reduce((sum, a) => sum + (a.fact_check_score || 0), 0) || 0) / (articles?.length || 1)
  console.log(`[Workflow Step 5/10] ✓ Fact-checked ${articles?.length || 0} articles (avg score: ${avgScore.toFixed(1)}/10)`)
}

// SECONDARY SECTION
async function generateSecondaryTitles(campaignId: string) {
  "use step"

  console.log('[Workflow Step 6/10] Generating 6 secondary titles...')
  const processor = new RSSProcessor()
  await processor.generateTitlesOnly(campaignId, 'secondary', 6)

  const { data: articles } = await supabaseAdmin
    .from('secondary_articles')
    .select('id, headline')
    .eq('campaign_id', campaignId)
    .not('headline', 'is', null)

  console.log(`[Workflow Step 6/10] ✓ Generated ${articles?.length || 0} secondary titles`)
}

async function generateSecondaryBodiesBatch1(campaignId: string) {
  "use step"

  console.log('[Workflow Step 7/10] Generating 3 secondary bodies (batch 1)...')
  const processor = new RSSProcessor()
  await processor.generateBodiesOnly(campaignId, 'secondary', 0, 3)

  const { data: articles } = await supabaseAdmin
    .from('secondary_articles')
    .select('id, content')
    .eq('campaign_id', campaignId)
    .not('content', 'is', null)

  console.log(`[Workflow Step 7/10] ✓ Total bodies generated: ${articles?.length || 0}`)
}

async function generateSecondaryBodiesBatch2(campaignId: string) {
  "use step"

  console.log('[Workflow Step 8/10] Generating 3 more secondary bodies (batch 2)...')
  const processor = new RSSProcessor()
  await processor.generateBodiesOnly(campaignId, 'secondary', 3, 3)

  const { data: articles } = await supabaseAdmin
    .from('secondary_articles')
    .select('id, content')
    .eq('campaign_id', campaignId)
    .not('content', 'is', null)

  console.log(`[Workflow Step 8/10] ✓ Total secondary bodies: ${articles?.length || 0}`)
}

async function factCheckSecondary(campaignId: string) {
  "use step"

  console.log('[Workflow Step 9/10] Fact-checking all secondary articles...')
  const processor = new RSSProcessor()
  await processor.factCheckArticles(campaignId, 'secondary')

  const { data: articles } = await supabaseAdmin
    .from('secondary_articles')
    .select('id, fact_check_score')
    .eq('campaign_id', campaignId)
    .not('fact_check_score', 'is', null)

  const avgScore = (articles?.reduce((sum, a) => sum + (a.fact_check_score || 0), 0) || 0) / (articles?.length || 1)
  console.log(`[Workflow Step 9/10] ✓ Fact-checked ${articles?.length || 0} articles (avg score: ${avgScore.toFixed(1)}/10)`)
}

// FINALIZE
async function finalizeCampaign(campaignId: string) {
  "use step"

  console.log('[Workflow Step 10/10] Finalizing campaign...')
  const processor = new RSSProcessor()

  // Auto-select top 3 per section
  await processor.selectTopArticlesForCampaign(campaignId)

  const { data: activeArticles } = await supabaseAdmin
    .from('articles')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)

  const { data: activeSecondary } = await supabaseAdmin
    .from('secondary_articles')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)

  console.log(`Selected ${activeArticles?.length || 0} primary, ${activeSecondary?.length || 0} secondary`)

  // Generate welcome section
  await processor.generateWelcomeSection(campaignId)

  // Subject line (generated in selectTopArticlesForCampaign)
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

  // Stage 1 unassignment
  const unassignResult = await processor.unassignUnusedPosts(campaignId)
  console.log(`[Workflow Step 10/10] ✓ Finalized. Unassigned ${unassignResult.unassigned} unused posts`)
}
```

### Vercel.json Configuration

```json
{
  "crons": [
    {
      "path": "/api/cron/trigger-workflow",
      "schedule": "*/5 * * * *"
    }
  ],
  "functions": {
    "app/api/cron/trigger-workflow/route.ts": {
      "maxDuration": 60
    },
    "app/api/workflows/process-rss/route.ts": {
      "maxDuration": 800
    }
  }
}
```

### Key Features

1. **"use workflow" directive:** Marks function as Vercel Workflow
2. **"use step" directive:** Marks each step function with 800s timeout
3. **Sequential execution:** Steps run in order, waiting for previous to complete
4. **Error handling:** If step fails, workflow stops (can be enhanced with retries)
5. **Progress logging:** Each step logs start, progress, completion
6. **Multi-tenant:** Workflow triggered per newsletter based on schedule

### Benefits Over Old System

| Feature | Old System | New Workflow System |
|---------|-----------|---------------------|
| **Timeout** | 600s total | 800s per step (8000s max) |
| **Progress** | No visibility | Step-by-step logs |
| **Retries** | All-or-nothing | Per-step retries possible |
| **Debugging** | Hard to isolate | Clear step boundaries |
| **Reliability** | One failure = total fail | Steps can complete independently |

---

## Implementation Checklist

### Phase 1: Database & Core Functions

- [ ] Create `app_settings` table with columns: `key`, `value` (JSONB), `ai_provider`, `newsletter_id`
- [ ] Create `ai_prompt_tests` table for testing playground (optional but recommended)
- [ ] Implement `callAIWithPrompt()` function in `lib/openai.ts`
- [ ] Implement `getPromptJSON()` function in `lib/openai.ts`
- [ ] Migrate existing hardcoded prompts to database as complete JSON
- [ ] Test AI calls with database-stored prompts

### Phase 2: Settings > AI Prompts Page

- [ ] Create Settings page with AI Prompts tab
- [ ] Implement prompt listing UI (grouped by category)
- [ ] Build Edit Prompt popup with:
  - [ ] AI Provider selector (OpenAI/Claude)
  - [ ] JSON textarea editor
  - [ ] Test, Cancel, Save buttons
- [ ] Implement Test Prompt functionality
- [ ] Implement Reset to Default functionality
- [ ] Implement Save as Default functionality
- [ ] Create API endpoints:
  - [ ] `GET /api/settings/ai-prompts`
  - [ ] `PATCH /api/settings/ai-prompts`
  - [ ] `POST /api/settings/ai-prompts`

### Phase 3: AI Prompt Testing Playground

- [ ] Create Testing Playground page at `/dashboard/[slug]/settings/AIPromptTesting`
- [ ] Build UI components:
  - [ ] Provider & Prompt Type selectors
  - [ ] RSS Post selector
  - [ ] JSON editor with auto-load
  - [ ] Test buttons (single & multiple)
  - [ ] Results modal
  - [ ] Reference guide
- [ ] Implement live prompt loading
- [ ] Implement saved prompt auto-save
- [ ] Build test modal with collapsible sections
- [ ] Create API endpoints:
  - [ ] `GET /api/ai/load-live-prompt`
  - [ ] `GET /api/ai/load-prompt`
  - [ ] `POST /api/ai/save-prompt`
  - [ ] `POST /api/ai/test-prompt`
  - [ ] `POST /api/ai/test-prompt-multiple`

### Phase 4: RSS Ingestion Every 15 Minutes

- [ ] Update `vercel.json` cron to run every 15 minutes
- [ ] Create `/api/cron/ingest-rss` endpoint
- [ ] Implement RSS feed fetching and parsing
- [ ] Test cron execution locally and on Vercel
- [ ] Monitor logs to ensure 15-minute schedule works

### Phase 5: Workflow Migration

- [ ] Install Vercel Workflow SDK: `npm install workflow`
- [ ] Create workflow file: `lib/workflows/process-rss-workflow.ts`
- [ ] Implement 10-step workflow structure
- [ ] Add `"use workflow"` and `"use step"` directives
- [ ] Create schedule checker: `lib/schedule-checker.ts`
- [ ] Create trigger endpoint: `/api/cron/trigger-workflow`
- [ ] Update `vercel.json`:
  - [ ] Add trigger-workflow cron (every 5 min)
  - [ ] Set maxDuration for trigger (60s)
  - [ ] Set maxDuration for workflow route (800s)
- [ ] Test workflow execution locally
- [ ] Deploy and test on Vercel
- [ ] Monitor workflow logs
- [ ] Deprecate old single-function endpoint

### Phase 6: Testing & Validation

- [ ] Test AI prompt editing and saving
- [ ] Test AI prompt testing playground (single & multiple)
- [ ] Test RSS ingestion cron (verify runs every 15 min)
- [ ] Test workflow trigger cron (verify schedule checking)
- [ ] Test workflow execution end-to-end
- [ ] Verify step-by-step logging
- [ ] Test multi-tenant isolation (multiple newsletters)
- [ ] Load test: Ensure no timeouts under normal load

### Phase 7: Documentation & Cleanup

- [ ] Document AI prompt architecture for team
- [ ] Create user guide for Settings > AI Prompts
- [ ] Create user guide for Testing Playground
- [ ] Update deployment docs with new cron jobs
- [ ] Remove deprecated endpoints
- [ ] Clean up old hardcoded prompt references
- [ ] Archive old workflow code

---

## Troubleshooting

### AI Prompts Not Loading

1. Check `app_settings` table has prompts with correct `newsletter_id`
2. Verify `ai_provider` field matches selected provider
3. Check browser console for API errors
4. Verify `/api/settings/ai-prompts` endpoint returns data

### Test Prompt Fails

1. Verify JSON is valid (use JSON validator)
2. Check `messages` array exists and is not empty
3. Verify placeholders match available data
4. Check API key is valid (OpenAI or Claude)
5. Review `/api/ai/test-prompt` logs for errors

### RSS Ingestion Not Running

1. Check `vercel.json` has correct cron schedule
2. Verify cron endpoint is deployed
3. Check Vercel logs for cron execution
4. Test manually: `GET /api/cron/ingest-rss?secret=YOUR_SECRET`
5. Verify RSS feeds exist and are active in database

### Workflow Not Triggering

1. Check schedule settings in `app_settings` table
2. Verify `email_reviewScheduleEnabled` is `'true'`
3. Check current Central Time matches scheduled time
4. Review `/api/cron/trigger-workflow` logs
5. Test manually: `GET /api/cron/trigger-workflow?secret=YOUR_SECRET`

### Workflow Fails Mid-Execution

1. Check Vercel logs for specific step that failed
2. Review error message in workflow logs
3. Verify database has required data for step
4. Check AI API rate limits not exceeded
5. Ensure `maxDuration` is set correctly in `vercel.json`

---

## Summary

This migration guide provides everything needed to replicate the AI prompt architecture and workflow-based newsletter processing from this system to another newsletter platform.

**Key Takeaways:**

1. **AI Prompts:** Store complete JSON API requests in database, use `callAIWithPrompt()` everywhere
2. **Settings Page:** Build robust UI for editing, testing, resetting prompts
3. **Testing Playground:** Provide comprehensive testing tools for experimentation
4. **RSS Ingestion:** Run every 15 minutes for fresh content
5. **Workflow:** Use 10-step workflow for better timeout management and reliability

**Success Criteria:**

- ✅ All AI calls use `callAIWithPrompt()` with database prompts
- ✅ Settings > AI Prompts page allows easy editing and testing
- ✅ Testing Playground enables safe experimentation
- ✅ RSS ingestion runs every 15 minutes without issues
- ✅ Workflow completes all 10 steps successfully
- ✅ Multi-tenant isolation works (each newsletter independent)

---

**End of Migration Guide**
