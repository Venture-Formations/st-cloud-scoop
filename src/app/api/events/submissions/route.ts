import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabaseAdmin
      .from('events')
      .select('*')
      .not('submission_status', 'is', null)
      .order('created_at', { ascending: false })

    // Filter by status if specified
    if (status && status !== 'all') {
      query = query.eq('submission_status', status)
    }

    const { data: submissions, error } = await query

    if (error) throw error

    return NextResponse.json({ submissions: submissions || [] })

  } catch (error) {
    console.error('Failed to load submissions:', error)
    return NextResponse.json({
      error: 'Failed to load submissions',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
