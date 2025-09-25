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
 * Generate daily road work data using AI
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

    // Call AI to generate road work data
    const prompt = AI_PROMPTS.roadWorkGenerator(targetDate)
    console.log('Calling AI for road work generation...')

    const aiResponse = await callOpenAI(prompt, 3000, 0.7) // Higher tokens and temperature for comprehensive search
    console.log('AI response received:', typeof aiResponse, aiResponse?.length || 'N/A')

    // Parse AI response
    let roadWorkItems: RoadWorkItem[]
    try {
      if (typeof aiResponse === 'string') {
        roadWorkItems = JSON.parse(aiResponse)
      } else if (Array.isArray(aiResponse)) {
        roadWorkItems = aiResponse
      } else if (aiResponse && typeof aiResponse === 'object' && aiResponse.raw) {
        roadWorkItems = JSON.parse(aiResponse.raw)
      } else {
        throw new Error('Unexpected AI response format')
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError)
      console.log('Raw AI response:', aiResponse)
      throw new Error('Failed to parse road work data from AI response')
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
    return roadWorkData as RoadWorkData

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