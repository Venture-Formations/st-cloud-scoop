import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { authOptions } from '@/lib/auth'

// Helper function to decode HTML entities
function decodeHtmlEntities(text: string | null | undefined): string | null {
  if (!text) return null

  return text
    .replace(/&#8217;/g, "'")  // Right single quotation mark
    .replace(/&#8216;/g, "'")  // Left single quotation mark
    .replace(/&#8220;/g, '"')  // Left double quotation mark
    .replace(/&#8221;/g, '"')  // Right double quotation mark
    .replace(/&#8230;/g, '…')  // Horizontal ellipsis
    .replace(/&#8211;/g, '–')  // En dash
    .replace(/&#8212;/g, '—')  // Em dash
    .replace(/&#038;/g, '&')   // Ampersand
    .replace(/&amp;/g, '&')    // Ampersand
    .replace(/&lt;/g, '<')     // Less than
    .replace(/&gt;/g, '>')     // Greater than
    .replace(/&quot;/g, '"')   // Quotation mark
    .replace(/&apos;/g, "'")   // Apostrophe
    .replace(/&nbsp;/g, ' ')   // Non-breaking space
}

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
    // Check if this is called from GET with secret (bypass session check)
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')
    const bypassAuth = secret === process.env.CRON_SECRET

    if (!bypassAuth) {
      const session = await getServerSession(authOptions)
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    console.log('Starting events sync from Visit St. Cloud API...')

    // For testing/manual sync, allow date override from query params
    const overrideStartDate = searchParams.get('start_date')
    const overrideEndDate = searchParams.get('end_date')

    let startDateString, endDateString

    if (overrideStartDate && overrideEndDate) {
      // Use override dates if provided
      startDateString = overrideStartDate
      endDateString = overrideEndDate
      console.log('Using override dates:', startDateString, 'to', endDateString)
    } else {
      // Calculate date range (next 7 days)
      const startDate = new Date()
      const endDate = new Date()
      endDate.setDate(startDate.getDate() + 7)

      startDateString = startDate.toISOString().split('T')[0]
      endDateString = endDate.toISOString().split('T')[0]
    }

    // Fetch events from Visit St. Cloud API with pagination
    let allEvents: VisitStCloudEvent[] = []
    let page = 1
    let hasMorePages = true
    const perPage = 100

    while (hasMorePages) {
      const apiUrl = `https://www.visitstcloud.com/wp-json/tribe/events/v1/events?start_date=${startDateString}&end_date=${endDateString}&per_page=${perPage}&page=${page}&status=publish`

      console.log(`Fetching page ${page} from:`, apiUrl)

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
      const pageEvents: VisitStCloudEvent[] = data.events || []

      if (pageEvents.length === 0) {
        // No more events, stop pagination
        hasMorePages = false
      } else {
        allEvents = allEvents.concat(pageEvents)
        console.log(`Page ${page}: fetched ${pageEvents.length} events (total so far: ${allEvents.length})`)

        // If we got fewer events than requested per page, we've reached the end
        if (pageEvents.length < perPage) {
          hasMorePages = false
        } else {
          page++
        }
      }

      // Safety check to prevent infinite loops
      if (page > 50) {
        console.warn('Reached maximum pagination safety limit (50 pages)')
        hasMorePages = false
      }
    }

    const events = allEvents
    console.log(`Fetched total ${events.length} events from API across ${page} pages`)

    let newEvents = 0
    let updatedEvents = 0
    let errors = 0

    // Process each event
    for (const apiEvent of events) {
      try {
        const eventData = {
          external_id: `visitstcloud_${apiEvent.id}`,
          title: decodeHtmlEntities(apiEvent.title) || 'Untitled Event',
          description: decodeHtmlEntities(apiEvent.description),
          start_date: new Date(apiEvent.start_date).toISOString(),
          end_date: apiEvent.end_date ? new Date(apiEvent.end_date).toISOString() : null,
          venue: decodeHtmlEntities(apiEvent.venue?.venue),
          address: decodeHtmlEntities(apiEvent.venue?.address),
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