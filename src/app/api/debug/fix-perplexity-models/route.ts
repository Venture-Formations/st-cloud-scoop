import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Debug endpoint to update deprecated Perplexity model names to current valid models
 *
 * Old model: llama-3.1-sonar-large-128k-online (deprecated)
 * New model: sonar (current valid model)
 *
 * Usage: GET /api/debug/fix-perplexity-models
 */
export async function GET() {
  try {
    // Find all prompts using the old Perplexity model
    const { data: prompts, error: fetchError } = await supabaseAdmin
      .from('app_settings')
      .select('key, value, ai_provider')
      .eq('ai_provider', 'perplexity')
      .like('key', 'ai_prompt_%')

    if (fetchError) {
      throw fetchError
    }

    if (!prompts || prompts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No Perplexity prompts found in database',
        updated: 0
      })
    }

    const updates: Array<{ key: string; oldModel: string; newModel: string }> = []
    let updateCount = 0

    // Update each prompt that has the old model
    for (const prompt of prompts) {
      try {
        // Parse the prompt config
        let config = typeof prompt.value === 'string'
          ? JSON.parse(prompt.value)
          : prompt.value

        // Check if it has the old model
        const oldModel = 'llama-3.1-sonar-large-128k-online'
        const newModel = 'sonar'

        if (config.model === oldModel) {
          // Update the model
          config.model = newModel

          // Save back to database
          const { error: updateError } = await supabaseAdmin
            .from('app_settings')
            .update({ value: JSON.stringify(config) })
            .eq('key', prompt.key)

          if (!updateError) {
            updates.push({
              key: prompt.key,
              oldModel,
              newModel
            })
            updateCount++
          } else {
            console.error(`Failed to update ${prompt.key}:`, updateError)
          }
        }
      } catch (parseError) {
        console.error(`Failed to parse ${prompt.key}:`, parseError)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updateCount} prompts with deprecated Perplexity models`,
      totalPerplexityPrompts: prompts.length,
      updated: updateCount,
      updates
    })

  } catch (error) {
    console.error('Error fixing Perplexity models:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
