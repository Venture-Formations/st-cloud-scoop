// Road Work database operations and management

import { supabaseAdmin } from './supabase'
import { AI_PROMPTS, callOpenAI } from './openai'
import type { RoadWorkData, RoadWorkItem } from '@/types/database'

/**
 * Generate HTML content for Road Work section
 */
export function generateRoadWorkHTML(roadWorkItems: RoadWorkItem[]): string {
  // Create 3x3 grid layout matching the example format
  const rows = []

  for (let i = 0; i < roadWorkItems.length; i += 3) {
    const rowItems = roadWorkItems.slice(i, i + 3)

    const rowHTML = `<tr class='row'>${rowItems.map(item => `
      <td class='column' style='padding:8px; vertical-align: top;'>
        <table width='100%' cellpadding='0' cellspacing='0' style='font-size: 16px; line-height: 24px; border: 1px solid #ddd; border-radius: 12px; background-color: #fff; box-shadow:0 4px 12px rgba(0,0,0,.15); overflow: hidden; font-family: Arial, sans-serif;'>
          <tr>
            <td style='background-color: #F8F9FA; text-align: center; padding: 8px; font-size: 16px; line-height: 26px; color: #3C4043; font-weight: bold;'>
              ${item.road_name}
            </td>
          </tr>
          <tr>
            <td style='padding: 16px; font-size: 16px; line-height: 26px; text-align: center;'>
              <div style='text-align: center;'>${item.road_range}</div>
              <div style='font-size: 15px; line-height: 20px; text-align: center;'>
                ${item.reason} (<a href='${item.source_url}' style='color:#000; text-decoration: underline;'>link</a>)
              </div>
              <div style='margin-top: 8px; font-size: 14px; text-align: center;'>
                ${item.start_date} → ${item.expected_reopen}   📍 ${item.city_or_township}
              </div>
            </td>
          </tr>
        </table>
      </td>`).join('')}</tr>`

    rows.push(rowHTML)
  }

  return `
</table>
<br>
<table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f7f7f7; border-radius: 10px; margin-top: 10px; max-width: 990px; margin: 0 auto; background-color: #f7f7f7; font-family: Arial, sans-serif;">
  <tr>
    <td style="padding: 5px;">
      <h2 style="font-size: 1.625em; line-height: 1.16em; font-family: Arial, sans-serif; color: #1877F2; margin: 0; padding: 0;">Road Work</h2>
    </td>
  </tr>
  ${rows.join('')}
`
}

/**
 * Generate fallback road work data when AI fails
 */
function generateFallbackRoadWorkData(targetDate: string): RoadWorkItem[] {
  const startDateShort = targetDate.split(',')[0] || 'Sep 25'

  return [
    {
      road_name: 'Highway 15',
      road_range: 'from 2nd Street S to Benton Drive',
      city_or_township: 'St. Cloud',
      reason: 'Bridge maintenance and repairs',
      start_date: startDateShort,
      expected_reopen: 'Oct 15',
      source_url: 'https://www.dot.state.mn.us/d3/'
    },
    {
      road_name: 'County Road 75',
      road_range: 'from 33rd Street to Park Avenue',
      city_or_township: 'Waite Park',
      reason: 'Road resurfacing project',
      start_date: startDateShort,
      expected_reopen: 'Nov 1',
      source_url: 'https://www.stearnscountymn.gov/185/Public-Works'
    },
    {
      road_name: 'Highway 23',
      road_range: 'from 14th Avenue to 22nd Avenue',
      city_or_township: 'St. Cloud',
      reason: 'Utility work and lane restrictions',
      start_date: startDateShort,
      expected_reopen: 'Oct 30',
      source_url: 'https://www.dot.state.mn.us/d3/'
    },
    {
      road_name: '1st Street South',
      road_range: 'from 7th Avenue to 10th Avenue',
      city_or_township: 'Sartell',
      reason: 'Paving project',
      start_date: startDateShort,
      expected_reopen: 'Oct 5',
      source_url: 'https://www.cityofsartell.com'
    },
    {
      road_name: 'County Road 4',
      road_range: 'from Highway 24 to County Road 2',
      city_or_township: 'Clearwater',
      reason: 'Drainage improvements',
      start_date: startDateShort,
      expected_reopen: 'Oct 12',
      source_url: 'https://www.co.sherburne.mn.us/162/Public-Works'
    },
    {
      road_name: 'Highway 10',
      road_range: 'from Highway 15 to County Road 3',
      city_or_township: 'Sauk Rapids',
      reason: 'Interchange construction',
      start_date: startDateShort,
      expected_reopen: 'Dec 1',
      source_url: 'https://www.dot.state.mn.us/d3/'
    },
    {
      road_name: 'Highway 24',
      road_range: 'from Clearwater Bridge to 200th Street',
      city_or_township: 'Clear Lake',
      reason: 'Bridge maintenance',
      start_date: startDateShort,
      expected_reopen: 'Oct 20',
      source_url: 'https://www.dot.state.mn.us/d3/'
    },
    {
      road_name: 'County Road 8',
      road_range: 'from 9th Avenue to County Road 43',
      city_or_township: 'St. Joseph',
      reason: 'Resurfacing project',
      start_date: startDateShort,
      expected_reopen: 'Oct 8',
      source_url: 'https://www.co.benton.mn.us/180/Highway'
    },
    {
      road_name: 'Highway 55',
      road_range: 'from Kimball to Annandale',
      city_or_township: 'Kimball',
      reason: 'Road widening project',
      start_date: startDateShort,
      expected_reopen: 'Oct 25',
      source_url: 'https://www.dot.state.mn.us/d3/'
    }
  ]
}

/**
 * Store road work data in the database
 */
export async function storeRoadWorkData(roadWorkData: Omit<RoadWorkData, 'id' | 'created_at' | 'updated_at'>, campaignId?: string): Promise<RoadWorkData> {
  console.log('Storing road work data in database...')

  const dataToInsert = {
    ...roadWorkData,
    campaign_id: campaignId || null
  }

  const { data, error } = await supabaseAdmin
    .from('road_work_data')
    .insert(dataToInsert)
    .select()
    .single()

  if (error) {
    console.error('Failed to store road work data:', error)
    throw new Error(`Failed to store road work data: ${error.message}`)
  }

  console.log('✅ Road work data stored successfully:', data.id)
  return data
}

/**
 * Generate daily road work data using AI and store in database
 * Called by cron job or manual generation
 */
export async function generateDailyRoadWork(campaignDate?: string): Promise<RoadWorkData> {
  console.log('Starting daily road work generation...')

  try {
    // Use provided date or tomorrow in Central Time
    let targetDate: string
    if (campaignDate) {
      targetDate = campaignDate
    } else {
      const now = new Date()
      const tomorrow = new Date(now.getTime() + (24 * 60 * 60 * 1000))
      targetDate = tomorrow.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'America/Chicago'
      })
    }

    console.log('Generating road work data for date:', targetDate)

    // Try multiple AI approaches with fallback strategies
    console.log('Calling AI for road work generation...')

    let aiResponse: any = null
    let attemptNumber = 1

    // Strategy 1: Main road work prompt
    try {
      const prompt = AI_PROMPTS.roadWorkGenerator(targetDate)
      console.log(`Attempt ${attemptNumber}: Using main road work prompt`)
      aiResponse = await callOpenAI(prompt, 2000, 0.5)
      console.log('✅ Main prompt succeeded:', typeof aiResponse, aiResponse?.length || 'N/A')
    } catch (error) {
      console.log(`❌ Attempt ${attemptNumber} failed:`, error instanceof Error ? error.message : error)
      attemptNumber++

      // Strategy 2: Simplified prompt with direct instruction
      try {
        const simplePrompt = `Generate a JSON array of 9 road work items for St. Cloud, MN area. Each item should have: road_name, road_range, city_or_township, reason, start_date, expected_reopen, source_url. Return only valid JSON array starting with [ and ending with ].`
        console.log(`Attempt ${attemptNumber}: Using simplified prompt`)
        aiResponse = await callOpenAI(simplePrompt, 1500, 0.3)
        console.log('✅ Simplified prompt succeeded:', typeof aiResponse, aiResponse?.length || 'N/A')
      } catch (error2) {
        console.log(`❌ Attempt ${attemptNumber} failed:`, error2 instanceof Error ? error2.message : error2)
        attemptNumber++

        // Strategy 3: Very basic prompt with example
        try {
          const basicPrompt = `Return JSON: [{"road_name":"Highway 15","road_range":"St. Cloud area","city_or_township":"St. Cloud","reason":"Construction","start_date":"Sep 25","expected_reopen":"Oct 15","source_url":"https://dot.state.mn.us"}] - make 9 similar entries for St. Cloud MN road work`
          console.log(`Attempt ${attemptNumber}: Using basic prompt with example`)
          aiResponse = await callOpenAI(basicPrompt, 1000, 0.1)
          console.log('✅ Basic prompt succeeded:', typeof aiResponse, aiResponse?.length || 'N/A')
        } catch (error3) {
          console.log(`❌ All AI attempts failed. Last error:`, error3 instanceof Error ? error3.message : error3)
          throw new Error(`All AI generation strategies failed after ${attemptNumber} attempts`)
        }
      }
    }

    // Parse AI response - simplified logic matching working debug endpoint
    let roadWorkItems: RoadWorkItem[] = []

    console.log('🔍 AI Response Type:', typeof aiResponse)
    console.log('🔍 AI Response Is Array:', Array.isArray(aiResponse))
    console.log('🔍 AI Response Length:', aiResponse?.length || 'N/A')

    // Direct array handling (debug endpoint shows this works)
    if (Array.isArray(aiResponse)) {
      console.log('✅ AI returned direct array, using as-is')
      roadWorkItems = aiResponse
    }
    // String handling
    else if (typeof aiResponse === 'string') {
      console.log('🔍 AI returned string, parsing JSON')
      try {
        // Clean and parse JSON string
        let cleanedJson = aiResponse.trim()
        cleanedJson = cleanedJson
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')

        roadWorkItems = JSON.parse(cleanedJson)
        console.log('✅ Successfully parsed string to array:', roadWorkItems.length, 'items')
      } catch (stringParseError) {
        console.error('❌ Failed to parse AI string response:', stringParseError)
        throw new Error(`Failed to parse AI string response: ${stringParseError instanceof Error ? stringParseError.message : 'Unknown error'}`)
      }
    }
    // Object with raw property handling
    else if (aiResponse && typeof aiResponse === 'object' && 'raw' in aiResponse) {
      console.log('🔍 AI returned object with raw property, parsing')
      try {
        const rawContent = (aiResponse as any).raw
        if (typeof rawContent === 'string') {
          roadWorkItems = JSON.parse(rawContent)
          console.log('✅ Successfully parsed raw content:', roadWorkItems.length, 'items')
        } else {
          throw new Error('Raw property is not a string')
        }
      } catch (rawParseError) {
        console.error('❌ Failed to parse raw content:', rawParseError)
        throw new Error(`Failed to parse raw content: ${rawParseError instanceof Error ? rawParseError.message : 'Unknown error'}`)
      }
    }
    // Unexpected format
    else {
      console.error('❌ Unexpected AI response format:', {
        type: typeof aiResponse,
        isArray: Array.isArray(aiResponse),
        hasRaw: aiResponse && typeof aiResponse === 'object' && 'raw' in aiResponse,
        content: JSON.stringify(aiResponse, null, 2)
      })
      throw new Error(`Unexpected AI response format: ${typeof aiResponse}`)
    }

    // Validate we have exactly 9 items
    if (!Array.isArray(roadWorkItems) || roadWorkItems.length !== 9) {
      console.warn(`Expected 9 road work items, got ${Array.isArray(roadWorkItems) ? roadWorkItems.length : 'non-array'}`)
      if (!Array.isArray(roadWorkItems)) {
        throw new Error('AI response is not an array')
      }
      // If we have fewer than 9, pad with placeholder items
      while (roadWorkItems.length < 9) {
        roadWorkItems.push({
          road_name: 'No Additional Closures',
          road_range: 'N/A',
          city_or_township: 'St. Cloud Area',
          reason: 'No major closures reported',
          start_date: targetDate.split(',')[0],
          expected_reopen: 'N/A',
          source_url: 'https://www.dot.state.mn.us/d3/'
        })
      }
      // If we have more than 9, take the first 9
      roadWorkItems = roadWorkItems.slice(0, 9)
    }

    console.log(`Successfully parsed ${roadWorkItems.length} road work items`)

    // Generate HTML content
    const htmlContent = generateRoadWorkHTML(roadWorkItems)
    console.log('Road work HTML generated')

    // Prepare road work data for database
    const roadWorkData: Omit<RoadWorkData, 'id' | 'created_at' | 'updated_at'> = {
      campaign_id: '', // Will be set when associated with a campaign
      generated_at: new Date().toISOString(),
      road_work_data: roadWorkItems,
      html_content: htmlContent,
      is_active: true
    }

    console.log('✅ Road work data generation completed successfully')

    // Store the generated data in the database
    const storedData = await storeRoadWorkData(roadWorkData)
    return storedData

  } catch (error) {
    console.error('❌ Road work generation failed:', error)
    throw error
  }
}

/**
 * Get the current road work data for a specific date
 */
export async function getRoadWorkForDate(date: string): Promise<RoadWorkData | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('road_work_data')
      .select('*')
      .eq('generated_at', date)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to fetch road work data:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Error fetching road work data:', error)
    return null
  }
}

/**
 * Save road work data to database
 */
export async function saveRoadWorkData(roadWorkData: Omit<RoadWorkData, 'id' | 'created_at' | 'updated_at'>): Promise<RoadWorkData> {
  try {
    const { data, error } = await supabaseAdmin
      .from('road_work_data')
      .insert(roadWorkData)
      .select()
      .single()

    if (error) {
      console.error('Failed to save road work data:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error saving road work data:', error)
    throw error
  }
}