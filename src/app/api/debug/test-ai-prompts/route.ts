import { NextRequest, NextResponse } from 'next/server'
import { AI_PROMPTS, callOpenAI, callAIWithPrompt } from '@/lib/openai'
import { supabaseAdmin } from '@/lib/supabase'

// Helper function to parse AI response and extract fields
function parseAIResponse(response: any) {
  let parsedResponse = null
  let parseError = null
  let responseType = typeof response

  try {
    parsedResponse = typeof response === 'string' ? JSON.parse(response) : response
    responseType = typeof parsedResponse
  } catch (error) {
    parseError = error instanceof Error ? error.message : 'Failed to parse response'
    // If it's not JSON, treat it as plain text
    parsedResponse = response
  }

  return {
    parsed_response: parsedResponse,
    parse_error: parseError,
    response_type: responseType
  }
}

// Helper function to test with custom prompt content
async function testWithCustomPrompt(type: string, customPromptJson: string, testData: any, promptKey?: string) {
  try {
    // Parse the custom prompt JSON
    const customPromptConfig = JSON.parse(customPromptJson)

    console.log('[TEST] Custom prompt config:', {
      hasMessages: !!customPromptConfig.messages,
      messageCount: customPromptConfig.messages?.length,
      keys: Object.keys(customPromptConfig)
    })

    // Get the AI provider from database for this prompt key
    let provider: 'openai' | 'perplexity' = 'openai'
    if (promptKey) {
      const { data } = await supabaseAdmin
        .from('app_settings')
        .select('ai_provider')
        .eq('key', promptKey)
        .single()

      if (data?.ai_provider === 'perplexity') {
        provider = 'perplexity'
      }
    }

    // We'll use callWithStructuredPrompt directly with the custom config
    const { callWithStructuredPrompt } = await import('@/lib/openai')

    // Get placeholders based on prompt type
    // Map prompt keys to test data types
    const typeMapping: Record<string, string> = {
      'ai_prompt_content_evaluator': 'contentEvaluator',
      'ai_prompt_criteria_1': 'criteria_1',
      'ai_prompt_criteria_2': 'criteria_2',
      'ai_prompt_criteria_3': 'criteria_3',
      'ai_prompt_criteria_4': 'criteria_4',
      'ai_prompt_criteria_5': 'criteria_5',
      'ai_prompt_newsletter_writer': 'newsletterWriter',
      'ai_prompt_subject_line_generator': 'subjectLineGenerator',
      'ai_prompt_event_summarizer': 'eventSummarizer',
      'ai_prompt_fact_checker': 'factChecker',
      'ai_prompt_topic_deduper': 'topicDeduper',
      'ai_prompt_road_work_generator': 'roadWorkGenerator',
      'ai_prompt_road_work_validator': 'roadWorkValidator',
      'ai_prompt_wordle_definition': 'wordleDefinition',
      'ai_prompt_wordle_fact': 'wordleFact',
      'ai_prompt_road_work_parser': 'roadWorkParser'
    }

    // Use mapped type if available, otherwise use the provided type
    const actualType = promptKey && typeMapping[promptKey] ? typeMapping[promptKey] : type

    let placeholders: Record<string, string> = {}

    switch (actualType) {
      case 'contentEvaluator':
        placeholders = {
          title: testData.contentEvaluator.title,
          description: testData.contentEvaluator.description,
          content: testData.contentEvaluator.content,
          imagePenalty: '0'
        }
        break
      case 'criteria_1':
      case 'criteria_2':
      case 'criteria_3':
      case 'criteria_4':
      case 'criteria_5':
        placeholders = {
          title: testData.contentEvaluator.title,
          description: testData.contentEvaluator.description,
          content: testData.contentEvaluator.content,
          hasImage: 'true'
        }
        break
      case 'newsletterWriter':
        placeholders = {
          title: testData.newsletterWriter.title,
          description: testData.newsletterWriter.description,
          content: testData.newsletterWriter.content,
          source_url: testData.newsletterWriter.source_url
        }
        break
      case 'subjectLineGenerator':
        placeholders = {
          headline: testData.subjectLineGenerator[0].headline
        }
        break
      case 'eventSummarizer':
        placeholders = {
          title: testData.eventSummarizer.title,
          description: testData.eventSummarizer.description,
          venue: testData.eventSummarizer.venue
        }
        break
      case 'factChecker':
        placeholders = {
          newsletterContent: testData.factChecker.newsletterContent,
          originalContent: testData.factChecker.originalContent
        }
        break
      case 'topicDeduper':
        // Format articles list for placeholder (same format as AI_PROMPTS.topicDeduper)
        const articlesText = testData.topicDeduper.map((article: any, i: number) =>
          `${i}. ${article.headline}\n   ${article.content || 'No description'}`
        ).join('\n\n')
        placeholders = { articles: articlesText }
        break
      case 'roadWorkGenerator':
        placeholders = { campaignDate: testData.roadWorkGenerator }
        break
      case 'roadWorkValidator':
        const itemsText = testData.roadWorkValidator.roadWorkItems.map((item: any, i: number) => `
${i + 1}. ${item.road_name}
   Range: ${item.road_range || 'Not specified'}
   Location: ${item.city_or_township || 'Not specified'}
   Reason: ${item.reason || 'Not specified'}
   Start: ${item.start_date || 'Not specified'}
   Expected Reopen: ${item.expected_reopen || 'Not specified'}
   Source: ${item.source_url || 'Not specified'}
`).join('\n')
        placeholders = {
          targetDate: testData.roadWorkValidator.targetDate,
          currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          items: itemsText
        }
        break
      case 'wordleDefinition':
        placeholders = {
          word: testData.wordleDefinition.word
        }
        break
      case 'wordleFact':
        placeholders = {
          word: testData.wordleFact.word
        }
        break
      case 'roadWorkParser':
        placeholders = {
          content: testData.roadWorkParser.content,
          targetDate: testData.roadWorkParser.targetDate,
          sourceUrl: testData.roadWorkParser.sourceUrl
        }
        break
    }

    // Call AI with custom prompt config
    console.log('[TEST] Calling AI with provider:', provider)

    // For OpenAI, we want to capture the full response metadata
    let fullApiResponse: any = null
    let result: string

    if (provider === 'openai') {
      // Call OpenAI directly to get full response including usage
      const { openai } = await import('@/lib/openai')

      // Process placeholders in input/messages
      let processedInput = customPromptConfig.input || customPromptConfig.messages
      if (processedInput && Array.isArray(processedInput)) {
        processedInput = processedInput.map((msg: any) => {
          if (msg.content && typeof msg.content === 'string') {
            return {
              ...msg,
              content: Object.entries(placeholders).reduce(
                (content, [key, value]) => content.replace(
                  new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
                  value
                ),
                msg.content
              )
            }
          }
          return msg
        })
      }

      // Prepare the request
      const request: any = { ...customPromptConfig }
      if (processedInput) {
        request.input = processedInput
      }

      // Make the API call
      fullApiResponse = await (openai as any).responses.create(request)

      // Extract content
      const outputArray = fullApiResponse.output?.[0]?.content
      const jsonSchemaItem = outputArray?.find((c: any) => c.type === "json_schema")
      const textItem = outputArray?.find((c: any) => c.type === "text")

      let rawContent = jsonSchemaItem?.json ??
        jsonSchemaItem?.input_json ??
        fullApiResponse.output?.[0]?.content?.[0]?.json ??
        fullApiResponse.output?.[0]?.content?.[0]?.input_json ??
        textItem?.text ??
        fullApiResponse.output?.[0]?.content?.[0]?.text ??
        fullApiResponse.output_text ??
        fullApiResponse.text ??
        ""

      result = typeof rawContent === 'object' && rawContent !== null
        ? JSON.stringify(rawContent)
        : rawContent
    } else {
      // Use existing method for Perplexity
      result = await callWithStructuredPrompt(customPromptConfig, placeholders, provider)
    }

    // Parse the response to extract expected fields
    const parseResult = parseAIResponse(result)

    return {
      success: true,
      response: result,
      ...parseResult,
      full_api_response: fullApiResponse, // Include complete API response with usage
      note: `Tested with custom prompt (not saved to database). Provider: ${provider}`,
      custom_prompt_used: true,
      provider
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      custom_prompt_used: true
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, customPrompt, promptKey, event_id } = body

    if (!type || !customPrompt) {
      return NextResponse.json({
        success: false,
        error: 'Missing type or customPrompt in request body'
      }, { status: 400 })
    }

    console.log('[TEST-API] POST request:', { type, promptKey, hasCustomPrompt: !!customPrompt, event_id })

    // Fetch real event data if event_id is provided (for event summarizer testing)
    let realEventData: any = null
    if (event_id) {
      const { data: event } = await supabaseAdmin
        .from('events')
        .select('*')
        .eq('id', event_id)
        .single()

      if (event) {
        realEventData = event
        console.log('[TEST] Using real event data:', {
          id: event.id,
          title: event.title,
          start_date: event.start_date
        })
      }
    }

    // Test data for each prompt type
    const testData = {
      contentEvaluator: {
        title: 'St. Cloud School District Launches New STEM Program',
        description: 'The St. Cloud Area School District announced today that it will launch a comprehensive STEM education program this fall, providing students with hands-on experience in science, technology, engineering, and mathematics through partnerships with local businesses and St. Cloud State University.',
        content: 'The new program will be available to students in grades 6-12 and will include after-school clubs, summer camps, and specialized coursework. Local tech companies have pledged equipment donations and mentorship opportunities.'
      },
      newsletterWriter: {
        title: 'New Community Center Opens in Waite Park',
        description: 'Waite Park celebrated the grand opening of its new $5 million community center on Saturday, featuring a gym, meeting rooms, and senior activity spaces.',
        content: 'The 25,000 square foot facility at 715 2nd Ave S will serve as a hub for community activities, offering fitness classes, youth programs, and event rentals. Mayor Rick Miller said the center will "bring people together" and provide year-round recreational opportunities.',
        source_url: 'https://example.com/article'
      },
      subjectLineGenerator: [
        {
          headline: 'Sartell Bridge Construction Begins Monday',
          content: 'The Minnesota Department of Transportation will close the Sartell Bridge for major repairs starting Monday morning. The project is expected to last six weeks.'
        }
      ],
      eventSummarizer: realEventData ? {
        title: realEventData.title,
        description: realEventData.description || '',
        venue: realEventData.venue || realEventData.location || ''
      } : {
        title: 'Summer Concert Series at Lake George',
        description: 'Join us for free outdoor concerts every Thursday evening in July! Local bands will perform a variety of music styles from 6-8 PM. Bring your lawn chairs and blankets. Food trucks will be available.',
        venue: 'Lake George Amphitheater'
      },
      factChecker: {
        newsletterContent: `<h2>New Community Center Opens in Waite Park</h2>
<p>The city of Waite Park celebrated the grand opening of its new $5 million community center on Saturday. The 25,000 square foot facility features a modern gymnasium, meeting rooms, and dedicated senior activity spaces.</p>
<p>Mayor Rick Miller attended the ribbon-cutting ceremony and said the center will "bring our community together like never before." The facility is located at 715 2nd Ave S and will be open seven days a week.</p>`,
        originalContent: `Waite Park celebrated the grand opening of its new $5 million community center on Saturday, featuring a gym, meeting rooms, and senior activity spaces. The 25,000 square foot facility at 715 2nd Ave S will serve as a hub for community activities, offering fitness classes, youth programs, and event rentals. Mayor Rick Miller said the center will "bring people together" and provide year-round recreational opportunities.`
      },
      topicDeduper: [
        {
          id: '1',
          headline: 'Sartell Fire Department Open House This Saturday',
          content: 'Join Sartell firefighters for station tours, equipment demonstrations, and fire safety education. Event runs from 10am-2pm at the main station.'
        },
        {
          id: '2',
          headline: 'St. Cloud Fire Station 3 Hosts Community Open House',
          content: 'Fire Station 3 welcomes community members for an open house event this Saturday. Tour the facility and meet your local firefighters from 10am-2pm.'
        }
      ],
      roadWorkGenerator: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      roadWorkValidator: {
        roadWorkItems: [
          {
            road_name: 'Highway 15',
            road_range: 'From Division St to 33rd St S',
            city_or_township: 'St. Cloud',
            reason: 'Bridge replacement and road resurfacing',
            start_date: '2025-03-15',
            expected_reopen: '2025-06-01',
            source_url: 'https://www.dot.state.mn.us/d3/projects/hwy15stcloud/'
          },
          {
            road_name: 'County Road 75',
            road_range: '240th St to 250th St',
            city_or_township: 'Sartell',
            reason: 'Utility work and pavement repairs',
            start_date: '2025-04-01',
            expected_reopen: '2025-04-30',
            source_url: 'https://www.co.stearns.mn.us/publicworks'
          },
          {
            road_name: '2nd Street South',
            road_range: '5th Avenue to 10th Avenue',
            city_or_township: 'Waite Park',
            reason: 'Water main replacement',
            start_date: '2025-03-20',
            expected_reopen: '2025-05-15',
            source_url: 'https://www.waitepark.org/public-works'
          }
        ],
        targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      },
      wordleDefinition: {
        word: 'CLOUD'
      },
      wordleFact: {
        word: 'SCOOP'
      },
      roadWorkParser: {
        content: `--- https://www.dot.state.mn.us/d3/ ---
MN DOT District 3 Road Construction Updates
Current Projects in St. Cloud Area:
Highway 15 Bridge Replacement - Division St to 33rd St S, St. Cloud
Start: March 15, 2025 | Expected completion: June 1, 2025
Bridge replacement and road resurfacing project

--- https://www.co.stearns.mn.us/publicworks ---
County Road 75 Improvements
Location: 240th St to 250th St, Sartell
Timeline: April 1 - April 30, 2025
Utility work and pavement repairs`,
        targetDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        sourceUrl: 'https://www.dot.state.mn.us/d3/, https://www.co.stearns.mn.us/publicworks'
      }
    }

    const result = await testWithCustomPrompt(type, customPrompt, testData, promptKey)

    return NextResponse.json({
      success: true,
      message: 'Custom Prompt Test Results',
      prompt_type: type,
      prompt_key: promptKey,
      test_data: testData[type as keyof typeof testData],
      results: { [type]: result },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error testing custom prompt:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const promptType = searchParams.get('type') || 'all'
    const eventId = searchParams.get('event_id')

    const results: Record<string, any> = {}

    // Fetch real event data if event_id is provided (for event summarizer testing)
    let realEventData: any = null
    if (eventId) {
      const { data: event } = await supabaseAdmin
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single()

      if (event) {
        realEventData = event
        console.log('[TEST] Using real event data:', {
          id: event.id,
          title: event.title,
          start_date: event.start_date
        })
      }
    }

    // Test data for each prompt type
    const testData: any = {
      contentEvaluator: {
        title: 'St. Cloud School District Launches New STEM Program',
        description: 'The St. Cloud Area School District announced today that it will launch a comprehensive STEM education program this fall, providing students with hands-on experience in science, technology, engineering, and mathematics through partnerships with local businesses and St. Cloud State University.',
        content: 'The new program will be available to students in grades 6-12 and will include after-school clubs, summer camps, and specialized coursework. Local tech companies have pledged equipment donations and mentorship opportunities.'
      },
      newsletterWriter: {
        title: 'New Community Center Opens in Waite Park',
        description: 'Waite Park celebrated the grand opening of its new $5 million community center on Saturday, featuring a gym, meeting rooms, and senior activity spaces.',
        content: 'The 25,000 square foot facility at 715 2nd Ave S will serve as a hub for community activities, offering fitness classes, youth programs, and event rentals. Mayor Rick Miller said the center will "bring people together" and provide year-round recreational opportunities.',
        source_url: 'https://example.com/article'
      },
      subjectLineGenerator: [
        {
          headline: 'Sartell Bridge Construction Begins Monday',
          content: 'The Minnesota Department of Transportation will close the Sartell Bridge for major repairs starting Monday morning. The project is expected to last six weeks.'
        }
      ],
      eventSummarizer: realEventData ? {
        title: realEventData.title,
        description: realEventData.description || '',
        venue: realEventData.venue || realEventData.location || ''
      } : {
        title: 'Summer Concert Series at Lake George',
        description: 'Join us for free outdoor concerts every Thursday evening in July! Local bands will perform a variety of music styles from 6-8 PM. Bring your lawn chairs and blankets. Food trucks will be available.',
        venue: 'Lake George Amphitheater'
      },
      factChecker: {
        newsletterContent: `<h2>New Community Center Opens in Waite Park</h2>
<p>The city of Waite Park celebrated the grand opening of its new $5 million community center on Saturday. The 25,000 square foot facility features a modern gymnasium, meeting rooms, and dedicated senior activity spaces.</p>
<p>Mayor Rick Miller attended the ribbon-cutting ceremony and said the center will "bring our community together like never before." The facility is located at 715 2nd Ave S and will be open seven days a week.</p>`,
        originalContent: `Waite Park celebrated the grand opening of its new $5 million community center on Saturday, featuring a gym, meeting rooms, and senior activity spaces. The 25,000 square foot facility at 715 2nd Ave S will serve as a hub for community activities, offering fitness classes, youth programs, and event rentals. Mayor Rick Miller said the center will "bring people together" and provide year-round recreational opportunities.`
      },
      topicDeduper: [
        {
          id: '1',
          headline: 'Sartell Fire Department Open House This Saturday',
          content: 'Join Sartell firefighters for station tours, equipment demonstrations, and fire safety education. Event runs from 10am-2pm at the main station.'
        },
        {
          id: '2',
          headline: 'St. Cloud Fire Station 3 Hosts Community Open House',
          content: 'Fire Station 3 welcomes community members for an open house event this Saturday. Tour the facility and meet your local firefighters from 10am-2pm.'
        },
        {
          id: '3',
          headline: 'New Coffee Shop Opens on Fifth Avenue',
          content: 'Local entrepreneur Sarah Johnson launched her specialty coffee business downtown. The shop features locally roasted beans and homemade pastries.'
        },
        {
          id: '4',
          headline: 'Grand Opening Celebration at City Center Cafe',
          content: 'Ribbon cutting ceremony held for new downtown coffee shop. Owner Sarah Johnson welcomes customers to try specialty drinks and fresh baked goods.'
        },
        {
          id: '5',
          headline: 'School Board Meeting Scheduled for Tuesday',
          content: 'District 742 School Board will discuss the 2025 budget proposal at Tuesday evening meeting. Public comment period begins at 6:30pm.'
        }
      ],
      roadWorkGenerator: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      roadWorkValidator: {
        roadWorkItems: [
          {
            road_name: 'Highway 15',
            road_range: 'From Division St to 33rd St S',
            city_or_township: 'St. Cloud',
            reason: 'Bridge replacement and road resurfacing',
            start_date: '2025-03-15',
            expected_reopen: '2025-06-01',
            source_url: 'https://www.dot.state.mn.us/d3/projects/hwy15stcloud/'
          },
          {
            road_name: 'County Road 75',
            road_range: '240th St to 250th St',
            city_or_township: 'Sartell',
            reason: 'Utility work and pavement repairs',
            start_date: '2025-04-01',
            expected_reopen: '2025-04-30',
            source_url: 'https://www.co.stearns.mn.us/publicworks'
          },
          {
            road_name: '2nd Street South',
            road_range: '5th Avenue to 10th Avenue',
            city_or_township: 'Waite Park',
            reason: 'Water main replacement',
            start_date: '2025-03-20',
            expected_reopen: '2025-05-15',
            source_url: 'https://www.waitepark.org/public-works'
          }
        ],
        targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      },
      wordleDefinition: {
        word: 'CLOUD'
      },
      wordleFact: {
        word: 'SCOOP'
      },
      roadWorkParser: {
        content: `--- https://www.dot.state.mn.us/d3/ ---
MN DOT District 3 Road Construction Updates
Current Projects in St. Cloud Area:
Highway 15 Bridge Replacement - Division St to 33rd St S, St. Cloud
Start: March 15, 2025 | Expected completion: June 1, 2025
Bridge replacement and road resurfacing project

--- https://www.co.stearns.mn.us/publicworks ---
County Road 75 Improvements
Location: 240th St to 250th St, Sartell
Timeline: April 1 - April 30, 2025
Utility work and pavement repairs`,
        targetDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        sourceUrl: 'https://www.dot.state.mn.us/d3/, https://www.co.stearns.mn.us/publicworks'
      },
      imageAnalyzer: 'Image analysis requires actual image input - use the image ingest endpoint instead'
    }

    // Test Content Evaluator (now calls OpenAI internally)
    if (promptType === 'all' || promptType === 'contentEvaluator') {
      console.log('Testing Content Evaluator...')
      try {
        const response = await AI_PROMPTS.contentEvaluator(testData.contentEvaluator)
        const parseResult = parseAIResponse(response)
        results.contentEvaluator = {
          success: true,
          response,
          ...parseResult,
          response_length: response.length,
          format: 'Structured JSON (calls OpenAI internally)'
        }
      } catch (error) {
        results.contentEvaluator = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Test Criteria Prompts (1-5)
    for (let i = 1; i <= 5; i++) {
      const criteriaType = `criteria_${i}`
      if (promptType === 'all' || promptType === criteriaType) {
        console.log(`Testing Criterion ${i}...`)
        try {
          const promptKey = `ai_prompt_criteria_${i}`
          const response = await callAIWithPrompt(
            promptKey,
            {
              title: testData.contentEvaluator.title,
              description: testData.contentEvaluator.description,
              content: testData.contentEvaluator.content,
              hasImage: 'true'
            }
          )
          const parseResult = parseAIResponse(response)
          results[criteriaType] = {
            success: true,
            response,
            ...parseResult,
            response_length: typeof response === 'string' ? response.length : JSON.stringify(response).length,
            format: 'JSON with score (0-10) and reason fields'
          }
        } catch (error) {
          results[criteriaType] = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }
    }

    // Test Newsletter Writer (now calls OpenAI internally)
    if (promptType === 'all' || promptType === 'newsletterWriter') {
      console.log('Testing Newsletter Writer...')
      try {
        const response = await AI_PROMPTS.newsletterWriter(testData.newsletterWriter)
        const parseResult = parseAIResponse(response)
        results.newsletterWriter = {
          success: true,
          response,
          ...parseResult,
          response_length: response.length,
          format: 'Structured JSON (calls OpenAI internally)'
        }
      } catch (error) {
        results.newsletterWriter = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Test Subject Line Generator (now calls OpenAI internally)
    if (promptType === 'all' || promptType === 'subjectLineGenerator') {
      console.log('Testing Subject Line Generator...')
      try {
        const response = await AI_PROMPTS.subjectLineGenerator(testData.subjectLineGenerator)
        const parseResult = parseAIResponse(response)
        const responseObj = response as any
        results.subjectLineGenerator = {
          success: true,
          response,
          ...parseResult,
          character_count: typeof response === 'string' ? response.length : responseObj?.raw?.length || 0,
          format: 'Structured JSON (calls OpenAI internally)'
        }
      } catch (error) {
        results.subjectLineGenerator = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Test Event Summarizer
    if (promptType === 'all' || promptType === 'eventSummarizer') {
      console.log('Testing Event Summarizer...')
      try {
        const prompt = await AI_PROMPTS.eventSummarizer(testData.eventSummarizer)
        const response = await callOpenAI(prompt, 200, 0.7)
        const parseResult = parseAIResponse(response)
        results.eventSummarizer = {
          success: true,
          response,
          ...parseResult,
          prompt_length: prompt.length
        }
      } catch (error) {
        results.eventSummarizer = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Test Fact Checker
    if (promptType === 'all' || promptType === 'factChecker') {
      console.log('Testing Fact Checker...')
      try {
        const response = await AI_PROMPTS.factChecker(
          testData.factChecker.newsletterContent,
          testData.factChecker.originalContent
        )
        const parseResult = parseAIResponse(response)
        results.factChecker = {
          success: true,
          response,
          ...parseResult,
          response_length: typeof response === 'string' ? response.length : JSON.stringify(response).length,
          format: 'JSON with violations array'
        }
      } catch (error) {
        results.factChecker = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Test Road Work Generator (just show prompt, don't call AI)
    if (promptType === 'all' || promptType === 'roadWorkGenerator') {
      console.log('Testing Road Work Generator (prompt only)...')
      try {
        const prompt = await AI_PROMPTS.roadWorkGenerator(testData.roadWorkGenerator)
        results.roadWorkGenerator = {
          success: true,
          note: 'Prompt generated successfully. Use /api/debug/test-ai-road-work to actually generate road work data.',
          prompt_preview: prompt.substring(0, 500) + '...',
          prompt_length: prompt.length
        }
      } catch (error) {
        results.roadWorkGenerator = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Test Road Work Validator
    if (promptType === 'all' || promptType === 'roadWorkValidator') {
      console.log('Testing Road Work Validator...')
      try {
        const response = await AI_PROMPTS.roadWorkValidator(
          testData.roadWorkValidator.roadWorkItems,
          testData.roadWorkValidator.targetDate
        )
        const parseResult = parseAIResponse(response)
        results.roadWorkValidator = {
          success: true,
          response,
          ...parseResult,
          response_length: typeof response === 'string' ? response.length : JSON.stringify(response).length,
          format: 'JSON with validated road work items',
          items_validated: testData.roadWorkValidator.roadWorkItems.length
        }
      } catch (error) {
        results.roadWorkValidator = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Test Topic Deduper (now calls OpenAI internally)
    if (promptType === 'all' || promptType === 'topicDeduper') {
      console.log('Testing Topic Deduper...')
      try {
        // Convert test data to expected format (array of posts with title and description)
        const postsForDeduper = testData.topicDeduper.map((article: any) => ({
          title: article.headline,
          description: article.content
        }))

        const response = await AI_PROMPTS.topicDeduper(postsForDeduper)
        const parseResult = parseAIResponse(response)
        results.topicDeduper = {
          success: true,
          response,
          ...parseResult,
          response_length: response.length,
          format: 'Structured JSON (calls OpenAI internally)',
          articles_analyzed: testData.topicDeduper.length
        }
      } catch (error) {
        results.topicDeduper = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Test Wordle Definition
    if (promptType === 'all' || promptType === 'wordleDefinition') {
      console.log('Testing Wordle Definition...')
      try {
        const response = await AI_PROMPTS.wordleDefinition(testData.wordleDefinition.word)
        const parseResult = parseAIResponse(response)
        results.wordleDefinition = {
          success: true,
          response,
          ...parseResult,
          format: 'Plain text definition (under 50 words)'
        }
      } catch (error) {
        results.wordleDefinition = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Test Wordle Fact
    if (promptType === 'all' || promptType === 'wordleFact') {
      console.log('Testing Wordle Fact...')
      try {
        const response = await AI_PROMPTS.wordleFact(testData.wordleFact.word)
        const parseResult = parseAIResponse(response)
        results.wordleFact = {
          success: true,
          response,
          ...parseResult,
          format: 'Plain text fact (under 80 words)'
        }
      } catch (error) {
        results.wordleFact = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Test Road Work Parser
    if (promptType === 'all' || promptType === 'roadWorkParser') {
      console.log('Testing Road Work Parser...')
      try {
        const response = await AI_PROMPTS.roadWorkParser(
          testData.roadWorkParser.content,
          testData.roadWorkParser.targetDate,
          testData.roadWorkParser.sourceUrl
        )
        const parseResult = parseAIResponse(response)
        results.roadWorkParser = {
          success: true,
          response,
          ...parseResult,
          format: 'JSON array of road work items'
        }
      } catch (error) {
        results.roadWorkParser = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    // Image Analyzer note
    if (promptType === 'all' || promptType === 'imageAnalyzer') {
      results.imageAnalyzer = {
        success: true,
        note: 'Image analysis requires actual image input. Use POST /api/images/ingest with an image to test.'
      }
    }

    return NextResponse.json({
      success: true,
      message: 'AI Prompts Test Results',
      prompt_type: promptType,
      test_data: promptType === 'all' ? 'Sample data for all prompts' : testData[promptType as keyof typeof testData],
      results,
      usage_note: 'Add ?type=promptName to test individual prompts (contentEvaluator, criteria_1, criteria_2, criteria_3, criteria_4, criteria_5, newsletterWriter, subjectLineGenerator, eventSummarizer, factChecker, topicDeduper, roadWorkGenerator, roadWorkValidator, wordleDefinition, wordleFact, roadWorkParser, imageAnalyzer)',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error testing AI prompts:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
