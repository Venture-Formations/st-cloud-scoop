import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { authOptions } from '@/lib/auth'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

// PATCH - Update an event
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: eventId } = await params
    const body = await request.json()

    // Only allow updating certain fields
    const allowedFields = ['title', 'venue', 'address', 'featured'] as const
    const updateData: Record<string, any> = {}

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Add updated timestamp
    updateData.updated_at = new Date().toISOString()

    const { data: event, error } = await supabaseAdmin
      .from('events')
      .update(updateData)
      .eq('id', eventId)
      .select()
      .single()

    if (error) {
      console.error('Error updating event:', error)
      return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
    }

    return NextResponse.json({ event })

  } catch (error) {
    console.error('Update event error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// DELETE - Delete an event
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: eventId } = await params

    // First, delete any campaign_events that reference this event
    const { error: campaignEventsError } = await supabaseAdmin
      .from('campaign_events')
      .delete()
      .eq('event_id', eventId)

    if (campaignEventsError) {
      console.error('Error deleting campaign events:', campaignEventsError)
      return NextResponse.json({ error: 'Failed to delete related campaign events' }, { status: 500 })
    }

    // Then delete the event itself
    const { error: eventError } = await supabaseAdmin
      .from('events')
      .delete()
      .eq('id', eventId)

    if (eventError) {
      console.error('Error deleting event:', eventError)
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Delete event error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}