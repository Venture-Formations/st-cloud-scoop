import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { authOptions } from '@/lib/auth'

// GET - Fetch all AI prompts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: prompts, error } = await supabaseAdmin
      .from('app_settings')
      .select('key, value, description')
      .like('key', 'ai_prompt_%')
      .order('key', { ascending: true })

    if (error) {
      throw error
    }

    // Parse prompts into structured format
    const formattedPrompts = prompts?.map(p => {
      const description = p.description || ''
      const parts = description.split(' - ')
      const category = parts[0] || 'General'
      const nameAndDesc = parts.slice(1).join(' - ')
      const [name, ...descParts] = nameAndDesc.split(': ')

      return {
        key: p.key,
        category,
        name: name || p.key.replace('ai_prompt_', '').replace(/_/g, ' '),
        description: descParts.join(': ') || '',
        value: p.value
      }
    }) || []

    // Group by category
    const grouped = formattedPrompts.reduce((acc, prompt) => {
      if (!acc[prompt.category]) {
        acc[prompt.category] = []
      }
      acc[prompt.category].push(prompt)
      return acc
    }, {} as Record<string, typeof formattedPrompts>)

    return NextResponse.json({
      success: true,
      prompts: formattedPrompts,
      grouped
    })

  } catch (error) {
    console.error('Failed to fetch AI prompts:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// PATCH - Update a specific AI prompt
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { key, value } = body

    if (!key || !value) {
      return NextResponse.json(
        { error: 'Key and value are required' },
        { status: 400 }
      )
    }

    if (!key.startsWith('ai_prompt_')) {
      return NextResponse.json(
        { error: 'Invalid prompt key' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('app_settings')
      .update({
        value,
        updated_at: new Date().toISOString()
      })
      .eq('key', key)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Prompt updated successfully'
    })

  } catch (error) {
    console.error('Failed to update AI prompt:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// POST - Reset prompt to default value
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { key } = body

    if (!key || !key.startsWith('ai_prompt_')) {
      return NextResponse.json(
        { error: 'Invalid prompt key' },
        { status: 400 }
      )
    }

    // This would require fetching default from code
    // For now, return error - user needs to manually restore
    return NextResponse.json(
      { error: 'Reset functionality requires re-running initialization script' },
      { status: 400 }
    )

  } catch (error) {
    console.error('Failed to reset AI prompt:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
