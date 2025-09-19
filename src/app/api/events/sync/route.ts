import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { authOptions } from '@/lib/auth'

interface VisitStCloudEvent {
  id: string
  title: string
  description: string
  start_date: string
  end_date: string
  venue?: {
    venue: string
    address: string
  }
  url: string
  image?: {
    url: string
  }
  [key: string]: any
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Starting events sync from Visit St. Cloud API...')

    // Calculate date range (next 7 days)
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(startDate.getDate() + 7)

    const startDateString = startDate.toISOString().split('T')[0]
    const endDateString = endDate.toISOString().split('T')[0]

    // Fetch events from Visit St. Cloud API
    const apiUrl = `https://www.visitstcloud.com/wp-json/tribe/events/v1/events?start_date=${startDateString}&end_date=${endDateString}&per_page=100`

    console.log('Fetching from:', apiUrl)

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'St. Cloud Scoop Newsletter (stcscoop.com)',
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Visit St. Cloud API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const events: VisitStCloudEvent[] = data.events || []

    console.log(`Fetched ${events.length} events from API`)

    let newEvents = 0
    let updatedEvents = 0
    let errors = 0

    // Process each event
    for (const apiEvent of events) {
      try {
        const eventData = {
          external_id: `visitstcloud_${apiEvent.id}`,
          title: apiEvent.title || 'Untitled Event',
          description: apiEvent.description || null,
          start_date: new Date(apiEvent.start_date).toISOString(),
          end_date: apiEvent.end_date ? new Date(apiEvent.end_date).toISOString() : null,
          venue: apiEvent.venue?.venue || null,
          address: apiEvent.venue?.address || null,
          url: apiEvent.url || null,
          image_url: apiEvent.image?.url || null,
          featured: false, // Will be set manually
          active: true,
          raw_data: apiEvent,
          updated_at: new Date().toISOString()
        }

        // Check if event already exists
        const { data: existingEvent } = await supabaseAdmin
          .from('events')
          .select('id, updated_at')
          .eq('external_id', eventData.external_id)
          .single()

        if (existingEvent) {
          // Update existing event
          const { error: updateError } = await supabaseAdmin
            .from('events')
            .update(eventData)
            .eq('id', existingEvent.id)

          if (updateError) {
            console.error('Error updating event:', updateError)
            errors++
          } else {
            updatedEvents++
          }
        } else {
          // Insert new event
          const { error: insertError } = await supabaseAdmin
            .from('events')
            .insert([eventData])

          if (insertError) {
            console.error('Error inserting event:', insertError)
            errors++
          } else {
            newEvents++
          }
        }
      } catch (error) {
        console.error('Error processing event:', error)
        errors++
      }
    }

    // Mark events as inactive if they're no longer in the API response
    const apiExternalIds = events.map(e => `visitstcloud_${e.id}`)

    if (apiExternalIds.length > 0) {
      const { error: deactivateError } = await supabaseAdmin
        .from('events')
        .update({ active: false, updated_at: new Date().toISOString() })
        .like('external_id', 'visitstcloud_%')
        .not('external_id', 'in', `(${apiExternalIds.map(id => `'${id}'`).join(',')})`)
        .eq('active', true)

      if (deactivateError) {
        console.error('Error deactivating old events:', deactivateError)
      }
    }

    console.log(`Events sync complete. New: ${newEvents}, Updated: ${updatedEvents}, Errors: ${errors}`)

    return NextResponse.json({
      success: true,
      summary: {
        fetched: events.length,
        new: newEvents,
        updated: updatedEvents,
        errors: errors
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Events sync failed:', error)
    return NextResponse.json({
      error: 'Events sync failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET endpoint for manual testing
export async function GET(request: NextRequest) {
  try {
    // Check if secret parameter is provided for manual testing
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized - secret required' }, { status: 401 })
    }

    // Call the POST method
    return POST(request)

  } catch (error) {
    return NextResponse.json({
      error: 'Events sync test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}