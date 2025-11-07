import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET - Load criteria settings
export async function GET() {
  try {
    // Fetch all criteria-related settings
    const { data: settings, error } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .or('key.eq.criteria_enabled_count,key.like.criteria_%_name,key.like.criteria_%_weight,key.like.criteria_%_enabled')

    if (error) {
      console.error('Failed to load criteria settings:', error)
      return NextResponse.json(
        { error: 'Failed to load criteria settings' },
        { status: 500 }
      )
    }

    // Helper to extract value from JSONB or plain text
    const extractValue = (value: any): string => {
      if (typeof value === 'string') return value
      if (typeof value === 'object' && value !== null) return JSON.stringify(value).replace(/^"|"$/g, '')
      return String(value)
    }

    // Parse enabled count
    const enabledCountSetting = settings?.find(s => s.key === 'criteria_enabled_count')
    const enabledCount = enabledCountSetting ? parseInt(extractValue(enabledCountSetting.value)) : 3

    // Build criteria array
    const criteria = []
    for (let i = 1; i <= 5; i++) {
      const nameKey = `criteria_${i}_name`
      const weightKey = `criteria_${i}_weight`
      const enabledKey = `criteria_${i}_enabled`

      const nameSetting = settings?.find(s => s.key === nameKey)
      const weightSetting = settings?.find(s => s.key === weightKey)
      const enabledSetting = settings?.find(s => s.key === enabledKey)

      const name = nameSetting ? extractValue(nameSetting.value) : `Criterion ${i}`
      const weight = weightSetting ? parseFloat(extractValue(weightSetting.value)) : 1.0
      const enabled = enabledSetting ? extractValue(enabledSetting.value) !== 'false' : (i <= 3)

      criteria.push({
        number: i,
        name,
        weight,
        enabled
      })
    }

    return NextResponse.json({
      enabledCount,
      criteria
    })

  } catch (error) {
    console.error('Error loading criteria settings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Save criteria settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { enabledCount, criteria } = body

    if (!criteria || !Array.isArray(criteria)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    // Prepare settings to upsert
    // Note: app_settings.value is JSONB, so we need to wrap strings in quotes
    const settingsToUpsert: Array<{
      key: string
      value: any  // Will be JSONB
      description?: string
      updated_at: string
    }> = []

    // Add enabled count setting
    settingsToUpsert.push({
      key: 'criteria_enabled_count',
      value: JSON.stringify(enabledCount.toString()),  // "3" as JSON string
      description: 'Number of active scoring criteria (1-5)',
      updated_at: new Date().toISOString()
    })

    // Add each criterion's settings
    for (const criterion of criteria) {
      const num = criterion.number

      settingsToUpsert.push(
        {
          key: `criteria_${num}_name`,
          value: JSON.stringify(criterion.name),  // Wrap in JSON string
          description: `Display name for criterion ${num}`,
          updated_at: new Date().toISOString()
        },
        {
          key: `criteria_${num}_weight`,
          value: JSON.stringify(criterion.weight.toString()),  // Wrap in JSON string
          description: `Weight multiplier for criterion ${num}`,
          updated_at: new Date().toISOString()
        },
        {
          key: `criteria_${num}_enabled`,
          value: JSON.stringify(criterion.enabled.toString()),  // Wrap in JSON string
          description: `Whether criterion ${num} is active`,
          updated_at: new Date().toISOString()
        }
      )
    }

    // Upsert all settings
    // Try newsletter_id version first
    const { error: withNewsletterIdError } = await supabaseAdmin
      .from('app_settings')
      .upsert(
        settingsToUpsert.map(s => ({
          ...s,
          newsletter_id: null, // Will be ignored if column doesn't exist
          created_at: new Date().toISOString()
        })),
        {
          onConflict: 'key',
          ignoreDuplicates: false
        }
      )

    if (withNewsletterIdError) {
      console.error('Failed to save criteria settings:', withNewsletterIdError)
      return NextResponse.json(
        { error: 'Failed to save criteria settings', details: withNewsletterIdError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Criteria settings saved successfully'
    })

  } catch (error) {
    console.error('Error saving criteria settings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
