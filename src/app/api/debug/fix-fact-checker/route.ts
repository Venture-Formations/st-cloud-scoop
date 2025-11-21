import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 60

/**
 * Debug endpoint to check and fix the fact-checker prompt
 * GET: Check current configuration
 * POST: Fix the model from gpt-5 to gpt-4o
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('*')
      .eq('key', 'ai_prompt_fact_checker')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Fact-checker prompt not found' }, { status: 404 })
    }

    // Parse the prompt to check the model
    const promptConfig = typeof data.value === 'string' ? JSON.parse(data.value) : data.value

    return NextResponse.json({
      key: data.key,
      model: promptConfig.model,
      ai_provider: data.ai_provider,
      has_reasoning: !!promptConfig.reasoning,
      max_output_tokens: promptConfig.max_output_tokens,
      full_config: promptConfig
    })
  } catch (error) {
    console.error('Error checking fact-checker:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST() {
  try {
    // Get current configuration
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('*')
      .eq('key', 'ai_prompt_fact_checker')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Fact-checker prompt not found' }, { status: 404 })
    }

    // Parse and fix the configuration
    const promptConfig = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
    const oldModel = promptConfig.model

    // Fix the model
    promptConfig.model = 'gpt-4o'

    // Update in database
    const { error: updateError } = await supabaseAdmin
      .from('app_settings')
      .update({
        value: promptConfig,
        updated_at: new Date().toISOString()
      })
      .eq('key', 'ai_prompt_fact_checker')

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Fact-checker prompt fixed',
      old_model: oldModel,
      new_model: 'gpt-4o',
      updated_config: promptConfig
    })
  } catch (error) {
    console.error('Error fixing fact-checker:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
