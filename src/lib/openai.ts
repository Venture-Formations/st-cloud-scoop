import OpenAI from 'openai'
import { supabaseAdmin } from './supabase'

// OpenAI client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Perplexity client (uses OpenAI SDK with custom base URL)
export const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
})

// Helper function to fetch prompt from database (throws error if not found)
async function getPrompt(key: string): Promise<string> {
  try {
    const { data, error} = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .single()

    if (error || !data) {
      throw new Error(`Prompt '${key}' not found in database`)
    }

    console.log(`Using database prompt: ${key}`)
    return data.value
  } catch (error) {
    console.error(`Error fetching prompt ${key}:`, error)
    throw error
  }
}

// Helper function to recursively replace placeholders in any structure
function replacePlaceholdersDeep(obj: any, placeholders: Record<string, string>): any {
  if (typeof obj === 'string') {
    // Replace all placeholders in string
    return Object.entries(placeholders).reduce(
      (str, [key, value]) => str.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
      obj
    )
  }

  if (Array.isArray(obj)) {
    // Recursively process arrays
    return obj.map(item => replacePlaceholdersDeep(item, placeholders))
  }

  if (obj && typeof obj === 'object') {
    // Recursively process objects
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replacePlaceholdersDeep(value, placeholders)
    }
    return result
  }

  // Return primitives as-is
  return obj
}

// Helper function to call OpenAI or Perplexity with structured prompt configuration
// Supports structured JSON prompts with model parameters and conversation history
export async function callWithStructuredPrompt(
  config: any,  // Accept any config structure - let the API validate
  placeholders: Record<string, string>,
  provider: 'openai' | 'perplexity' = 'openai'
): Promise<string> {
  // Deep replace all placeholders in the entire config
  const processedConfig = replacePlaceholdersDeep(config, placeholders)

  // Select client based on provider
  const client = provider === 'perplexity' ? perplexity : openai

  // Select default model based on provider
  const defaultModel = provider === 'perplexity'
    ? 'sonar'
    : 'gpt-4o'

  console.log(`[AI] Calling ${provider.toUpperCase()} with structured prompt:`, {
    model: processedConfig.model || defaultModel,
    temperature: processedConfig.temperature ?? 0.7,
    input_count: processedConfig.input?.length || processedConfig.messages?.length || 0
  })

  if (provider === 'openai') {
    // Use Responses API for OpenAI - send processed config directly
    console.log('[AI] OpenAI Responses API request:', Object.keys(processedConfig))

    const response = await (client as any).responses.create(processedConfig)

    // Log full response metadata for debugging
    console.log(`[AI] OpenAI Responses API full metadata:`, {
      id: response.id,
      model: response.model,
      usage: response.usage,
      created: response.created,
      object: response.object
    })

    // Extract content using fallback chain (handles different response structures)
    const outputArray = response.output?.[0]?.content
    const jsonSchemaItem = outputArray?.find((c: any) => c.type === "json_schema")
    const textItem = outputArray?.find((c: any) => c.type === "text")

    let rawContent = jsonSchemaItem?.json ??
      jsonSchemaItem?.input_json ??
      response.output?.[0]?.content?.[0]?.json ??
      response.output?.[0]?.content?.[0]?.input_json ??
      textItem?.text ??
      response.output?.[0]?.content?.[0]?.text ??
      response.output_text ??
      response.text ??
      ""

    console.log(`[AI] OpenAI Responses API result:`, {
      length: typeof rawContent === 'string' ? rawContent.length : JSON.stringify(rawContent).length,
      type: typeof rawContent,
      contentTypes: outputArray?.map((c: any) => c.type)
    })

    // Handle already-parsed JSON objects
    if (typeof rawContent === 'object' && rawContent !== null) {
      return JSON.stringify(rawContent)  // Convert to string for consistency
    }

    return rawContent
  } else {
    // Perplexity still uses Chat Completions API
    const response = await client.chat.completions.create({
      model: processedConfig.model || defaultModel,
      messages: processedConfig.input || processedConfig.messages,
      temperature: processedConfig.temperature ?? 0.7,
      max_tokens: processedConfig.max_output_tokens || 1000,
      top_p: processedConfig.top_p,
      presence_penalty: processedConfig.presence_penalty,
      frequency_penalty: processedConfig.frequency_penalty,
    })

    const result = response.choices[0]?.message?.content || ''
    console.log(`[AI] Perplexity response received, length:`, result.length)

    return result
  }
}

/**
 * Universal AI prompt caller - works with OpenAI or Perplexity
 * Loads complete JSON API request from database and executes it
 *
 * @param promptKey - Database key (e.g., 'ai_prompt_content_evaluator')
 * @param placeholders - Dynamic content to replace in prompts (e.g., {{title}}, {{content}})
 * @returns AI response (parsed JSON or raw text)
 * @throws Error if prompt not found in database
 */
export async function callAIWithPrompt(
  promptKey: string,
  placeholders: Record<string, string> = {}
): Promise<any> {
  try {
    // Load complete JSON prompt from database
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('value, ai_provider')
      .eq('key', promptKey)
      .single()

    if (error || !data) {
      throw new Error(`❌ [AI-PROMPT] Prompt '${promptKey}' not found in database. Please configure this prompt in Settings > AI Prompts.`)
    }

    console.log(`✓ [AI-PROMPT] Using database prompt: ${promptKey}`)

    // Parse prompt JSON
    const promptConfig = typeof data.value === 'string'
      ? JSON.parse(data.value)
      : data.value

    // No validation - let API validate the structure
    console.log(`[AI-PROMPT] Prompt config keys:`, Object.keys(promptConfig))

    // Get provider (default to 'openai')
    const provider = (data.ai_provider === 'perplexity' ? 'perplexity' : 'openai') as 'openai' | 'perplexity'

    // Call AI with structured prompt
    const response = await callWithStructuredPrompt(promptConfig, placeholders, provider)

    // Try to parse as JSON, return raw if parsing fails
    try {
      return JSON.parse(response)
    } catch {
      return response
    }

  } catch (error) {
    console.error(`❌ [AI-PROMPT] ERROR calling ${promptKey}:`, error)
    throw error
  }
}


// Dynamic AI Prompts - Loaded from database (throws error if not found)
export const AI_PROMPTS = {
  contentEvaluator: async (post: { title: string; description: string; content?: string; hasImage?: boolean }) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'ai_prompt_content_evaluator')
        .single()

      if (error || !data) {
        throw new Error(`Prompt 'ai_prompt_content_evaluator' not found in database. Please configure this prompt in Settings > AI Prompts.`)
      }

      console.log('[AI] Using database prompt for contentEvaluator')

      // Prepare placeholders
      const imagePenaltyText = post.hasImage
        ? 'This post HAS an image.'
        : 'This post has NO image - subtract 5 points from interest_level.'

      const placeholders = {
        title: post.title,
        description: post.description || 'No description available',
        content: post.content ? post.content.substring(0, 1000) + '...' : 'No content available',
        imagePenalty: imagePenaltyText
      }

      // Check if structured JSON format (has messages array)
      const promptConfig = data.value // Supabase auto-parses JSONB

      if (promptConfig && typeof promptConfig === 'object' && promptConfig.messages && Array.isArray(promptConfig.messages)) {
        console.log('[AI] Using structured JSON prompt format')
        return await callWithStructuredPrompt(promptConfig, placeholders)
      }

      // Plain text fallback - do replacement and call OpenAI with default parameters
      console.log('[AI] Using plain text prompt format, calling OpenAI with default parameters')
      const promptText = typeof promptConfig === 'string' ? promptConfig : JSON.stringify(promptConfig)
      const finalPrompt = Object.entries(placeholders).reduce(
        (text, [key, value]) => text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
        promptText
      )

      // Call OpenAI with appropriate parameters for content evaluation
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: finalPrompt }],
        temperature: 0.3, // Low temperature for consistent scoring
      })

      return response.choices[0]?.message?.content || ''

    } catch (error) {
      console.error('[AI] Error loading contentEvaluator prompt:', error)
      throw error
    }
  },

  newsletterWriter: async (post: { title: string; description: string; content?: string; source_url?: string }) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'ai_prompt_newsletter_writer')
        .single()

      if (error || !data) {
        throw new Error(`Prompt 'ai_prompt_newsletter_writer' not found in database. Please configure this prompt in Settings > AI Prompts.`)
      }

      console.log('[AI] Using database prompt for newsletterWriter')

      // Prepare placeholders
      const placeholders = {
        title: post.title,
        description: post.description || 'No description available',
        content: post.content ? post.content.substring(0, 1500) + '...' : 'No additional content',
        url: post.source_url || ''
      }

      // Check if structured JSON format (has messages array)
      const promptConfig = data.value // Supabase auto-parses JSONB

      if (promptConfig && typeof promptConfig === 'object' && promptConfig.messages && Array.isArray(promptConfig.messages)) {
        console.log('[AI] Using structured JSON prompt format')
        return await callWithStructuredPrompt(promptConfig, placeholders)
      }

      // Plain text fallback - do replacement and call OpenAI with default parameters
      console.log('[AI] Using plain text prompt format, calling OpenAI with default parameters')
      const promptText = typeof promptConfig === 'string' ? promptConfig : JSON.stringify(promptConfig)
      const finalPrompt = Object.entries(placeholders).reduce(
        (text, [key, value]) => text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
        promptText
      )

      // Call OpenAI with appropriate parameters for newsletter writing
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: finalPrompt }],
        temperature: 0.7, // Higher temperature for creative writing
      })

      return response.choices[0]?.message?.content || ''

    } catch (error) {
      console.error('[AI] Error loading newsletterWriter prompt:', error)
      throw error
    }
  },

  eventSummarizer: async (event: { title: string; description: string | null; venue?: string | null }) => {
    const placeholders = {
      title: event.title,
      description: event.description || 'No description available',
      venue: event.venue || 'No venue specified'
    }

    return await callAIWithPrompt(
      'ai_prompt_event_summary',
      placeholders
    )
  },

  subjectLineGenerator: async (articles: Array<{ headline: string; content: string }>) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'ai_prompt_subject_line')
        .single()

      if (error || !data) {
        throw new Error(`Prompt 'ai_prompt_subject_line' not found in database. Please configure this prompt in Settings > AI Prompts.`)
      }

      console.log('[AI] Using database prompt for subjectLineGenerator')

      // Prepare article list for placeholder
      const articlesText = articles
        .map((article, i) => `${i + 1}. ${article.headline}\n   ${article.content.substring(0, 100)}...`)
        .join('\n\n')

      const placeholders = {
        articles: articlesText
      }

      // Check if structured JSON format (has messages array)
      const promptConfig = data.value // Supabase auto-parses JSONB

      if (promptConfig && typeof promptConfig === 'object' && promptConfig.messages && Array.isArray(promptConfig.messages)) {
        console.log('[AI] Using structured JSON prompt format')
        return await callWithStructuredPrompt(promptConfig, placeholders)
      }

      // Plain text fallback - do replacement and call OpenAI with default parameters
      console.log('[AI] Using plain text prompt format, calling OpenAI with default parameters')
      const promptText = typeof promptConfig === 'string' ? promptConfig : JSON.stringify(promptConfig)
      const finalPrompt = Object.entries(placeholders).reduce(
        (text, [key, value]) => text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
        promptText
      )

      // Call OpenAI with appropriate parameters for subject line generation
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: finalPrompt }],
        temperature: 0.8, // Higher temperature for creative headline variations
      })

      return response.choices[0]?.message?.content || ''

    } catch (error) {
      console.error('[AI] Error loading subjectLineGenerator prompt:', error)
      throw error
    }
  },

  roadWorkGenerator: async (campaignDate: string) => {
    const placeholders = {
      campaignDate: campaignDate
    }

    return await callAIWithPrompt(
      'ai_prompt_road_work',
      placeholders
    )
  },

  imageAnalyzer: async () => {
    return await getPrompt('ai_prompt_image_analyzer')
  },

  // Topic Deduper - Now supports database and structured format
  topicDeduper: async (posts: Array<{ title: string; description: string }>) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'ai_prompt_topic_deduper')
        .single()

      if (error || !data) {
        throw new Error(`Prompt 'ai_prompt_topic_deduper' not found in database. Please configure this prompt in Settings > AI Prompts.`)
      }

      console.log('[AI] Using database prompt for topicDeduper')

      // Prepare article list for placeholder
      const articlesText = posts.map((post, i) =>
        `${i}. ${post.title}\n   ${post.description || 'No description'}`
      ).join('\n\n')

      const placeholders = {
        articles: articlesText
      }

      // Check if structured JSON format (has messages array)
      const promptConfig = data.value // Supabase auto-parses JSONB

      if (promptConfig && typeof promptConfig === 'object' && promptConfig.messages && Array.isArray(promptConfig.messages)) {
        console.log('[AI] Using structured JSON prompt format')
        return await callWithStructuredPrompt(promptConfig, placeholders)
      }

      // Plain text fallback - do replacement and call OpenAI with default parameters
      console.log('[AI] Using plain text prompt format, calling OpenAI with default parameters')
      const promptText = typeof promptConfig === 'string' ? promptConfig : JSON.stringify(promptConfig)
      const finalPrompt = Object.entries(placeholders).reduce(
        (text, [key, value]) => text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
        promptText
      )

      // Call OpenAI with appropriate parameters for deduplication
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: finalPrompt }],
        temperature: 0.3, // Low temperature for consistent deduplication logic
      })

      return response.choices[0]?.message?.content || ''

    } catch (error) {
      console.error('[AI] Error loading topicDeduper prompt:', error)
      throw error
    }
  },

  // Previously non-editable prompts - NOW EDITABLE
  factChecker: async (newsletterContent: string, originalContent: string) => {
    const placeholders = {
      newsletterContent: newsletterContent,
      originalContent: originalContent.substring(0, 2000)
    }

    return await callAIWithPrompt(
      'ai_prompt_fact_checker',
      placeholders
    )
  },

  roadWorkValidator: async (roadWorkItems: any[], targetDate: string) => {
    const itemsText = roadWorkItems.map((item, i) => `
${i + 1}. ${item.road_name}
   Range: ${item.road_range || 'Not specified'}
   Location: ${item.city_or_township || 'Not specified'}
   Reason: ${item.reason || 'Not specified'}
   Start: ${item.start_date || 'Not specified'}
   Expected Reopen: ${item.expected_reopen || 'Not specified'}
   Source: ${item.source_url || 'Not specified'}
`).join('\n')

    const placeholders = {
      targetDate: targetDate,
      currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      items: itemsText
    }

    return await callAIWithPrompt(
      'ai_prompt_road_work_validator',
      placeholders
    )
  },

  wordleDefinition: async (word: string) => {
    const placeholders = {
      word: word
    }

    return await callAIWithPrompt(
      'ai_prompt_wordle_definition',
      placeholders
    )
  },

  wordleFact: async (word: string) => {
    const placeholders = {
      word: word
    }

    return await callAIWithPrompt(
      'ai_prompt_wordle_fact',
      placeholders
    )
  },

  roadWorkParser: async (content: string, targetDate: string, sourceUrl: string) => {
    const placeholders = {
      content: content.substring(0, 10000), // Limit content length
      targetDate: targetDate,
      sourceUrl: sourceUrl
    }

    return await callAIWithPrompt(
      'ai_prompt_road_work_parser',
      placeholders
    )
  }
}

// This function is no longer needed since we use web scraping instead of AI
export async function callOpenAIWithWeb(userPrompt: string, maxTokens = 1000, temperature = 0) {
  throw new Error('Web-enabled AI calls have been replaced with direct web scraping. Use wordle-scraper.ts instead.')
}

// Special function for road work generation using Responses API with web search
export async function callOpenAIWithWebSearch(systemPrompt: string, userPrompt: string): Promise<any> {
  const controller = new AbortController()
  try {
    console.log('Making OpenAI Responses API request with web search...')
    console.log('System prompt length:', systemPrompt.length)
    console.log('User prompt length:', userPrompt.length)

    const timeoutId = setTimeout(() => controller.abort(), 90000) // 90 second timeout for web search

    try {
      console.log('Using GPT-4o model with web search tools...')

      // Use the Responses API with web tools as provided by the user
      const response = await (openai as any).responses.create({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }], // correct web search tool type
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0
      }, {
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      // Log the full response structure for debugging
      console.log('Full response structure:', JSON.stringify(response, null, 2).substring(0, 1000))

      // Extract the response text using the format from the user's example
      const text = response.output_text ?? response.output?.[0]?.content?.[0]?.text ?? ""

      if (!text) {
        console.error('No text found in response. Response keys:', Object.keys(response))
        throw new Error('No response from OpenAI Responses API')
      }

      console.log('OpenAI Responses API response received, length:', text.length)
      console.log('Response preview:', text.substring(0, 500))

      // Extract JSON array from the response
      const start = text.indexOf("[")
      const end = text.lastIndexOf("]")

      if (start === -1 || end === -1) {
        console.warn('No JSON array found in response')
        console.warn('Full response text:', text.substring(0, 1000))
        return { raw: text }
      }

      const jsonString = text.slice(start, end + 1)
      console.log('Extracted JSON string length:', jsonString.length)
      console.log('JSON preview:', jsonString.substring(0, 300))

      try {
        const parsedData = JSON.parse(jsonString)
        console.log('Successfully parsed road work data:', parsedData.length, 'items')
        if (parsedData.length > 0) {
          console.log('First item:', JSON.stringify(parsedData[0], null, 2))
        }
        return parsedData
      } catch (parseError) {
        console.error('Failed to parse extracted JSON:', parseError)
        console.error('JSON string:', jsonString.substring(0, 500))
        return { raw: text }
      }

    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.error('OpenAI Responses API error:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message)
      console.error('Error name:', error.name)
    }
    throw error
  }
}

function parseJSONResponse(content: string) {
  try {
    // Clean the content - remove any text before/after JSON (support both objects {} and arrays [])
    const objectMatch = content.match(/\{[\s\S]*\}/)
    const arrayMatch = content.match(/\[[\s\S]*\]/)

    if (arrayMatch) {
      // Prefer array match for prompts that expect arrays (like Wordle)
      return JSON.parse(arrayMatch[0])
    } else if (objectMatch) {
      // Use object match for other prompts
      return JSON.parse(objectMatch[0])
    } else {
      // Try parsing the entire content
      return JSON.parse(content.trim())
    }
  } catch (parseError) {
    console.warn('Failed to parse OpenAI response as JSON. Content length:', content.length)
    console.warn('Content preview:', content.substring(0, 200))
    console.warn('Parse error:', parseError instanceof Error ? parseError.message : parseError)
    return { raw: content }
  }
}

export async function callOpenAI(prompt: string, maxTokens = 1000, temperature = 0.3) {
  try {
    console.log('Calling OpenAI API...')

    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    try {
      console.log('Using GPT-4o model with improved JSON parsing...')
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: temperature,
      }, {
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response from OpenAI')
      }

      console.log('OpenAI response received')

      // Try to parse as JSON, fallback to raw content
      try {
        // Strip markdown code fences first (```json ... ``` or ``` ... ```)
        let cleanedContent = content
        const codeFenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        if (codeFenceMatch) {
          cleanedContent = codeFenceMatch[1]
          console.log('Stripped markdown code fences from response')
        }

        // Clean the content - remove any text before/after JSON (support both objects {} and arrays [])
        const objectMatch = cleanedContent.match(/\{[\s\S]*\}/)
        const arrayMatch = cleanedContent.match(/\[[\s\S]*\]/)

        if (arrayMatch) {
          // Prefer array match for prompts that expect arrays (like road work)
          return JSON.parse(arrayMatch[0])
        } else if (objectMatch) {
          // Use object match for other prompts
          return JSON.parse(objectMatch[0])
        } else {
          // Try parsing the entire content
          return JSON.parse(cleanedContent.trim())
        }
      } catch (parseError) {
        console.warn('Failed to parse OpenAI response as JSON. Content length:', content.length)
        console.warn('Content preview:', content.substring(0, 200))
        console.warn('Parse error:', parseError instanceof Error ? parseError.message : parseError)
        return { raw: content }
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.error('OpenAI API error with GPT-5:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message)
      console.error('Error name:', error.name)
      console.error('Error stack:', error.stack)
    }
    // Log additional error details for debugging
    if (typeof error === 'object' && error !== null) {
      console.error('Full error object:', JSON.stringify(error, null, 2))
    }
    throw error
  }
}