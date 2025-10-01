import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { authOptions } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const { reason } = await request.json()

    const { error } = await supabaseAdmin
      .from('events')
      .update({
        submission_status: 'rejected',
        active: false,
        reviewed_by: session.user?.email || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error

    // Log the rejection
    if (session.user?.email) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', session.user.email)
        .single()

      if (user) {
        await supabaseAdmin
          .from('user_activities')
          .insert([{
            user_id: user.id,
            action: 'event_submission_rejected',
            details: {
              event_id: id,
              reason: reason || 'No reason provided'
            }
          }])
      }
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Failed to reject submission:', error)
    return NextResponse.json({
      error: 'Failed to reject submission',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
