import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    // Check for criteria_enabled_count
    const { data: enabledCount, error: countError } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .eq('key', 'criteria_enabled_count')
      .single()

    // Check for criteria settings
    const { data: criteriaSettings, error: settingsError } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .or('key.like.criteria_%_name,key.like.criteria_%_weight,key.like.criteria_%_enabled')

    // Check for AI prompts
    const { data: aiPrompts, error: promptsError } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .like('key', 'ai_prompt_criteria_%')

    return NextResponse.json({
      success: true,
      criteria_enabled_count: enabledCount || null,
      criteria_settings_count: criteriaSettings?.length || 0,
      ai_prompts_count: aiPrompts?.length || 0,
      criteria_settings: criteriaSettings || [],
      ai_prompts: aiPrompts?.map(p => ({ key: p.key, has_value: !!p.value })) || [],
      errors: {
        count: countError?.message || null,
        settings: settingsError?.message || null,
        prompts: promptsError?.message || null
      },
      migration_needed: !enabledCount || !criteriaSettings || criteriaSettings.length === 0
    })

  } catch (error) {
    console.error('Error checking criteria config:', error)
    return NextResponse.json(
      { error: 'Failed to check criteria configuration', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
