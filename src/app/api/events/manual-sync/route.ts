import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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

export async function GET(request: NextRequest) {
  try {
    console.log('=== MANUAL EVENTS SYNC STARTED ===')
    console.log('Time:', new Date().toISOString())

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date') || '2025-06-01'
    const endDate = searchParams.get('end_date') || '2025-06-30'

    // Fetch events from Visit St. Cloud API
    const apiUrl = `https://www.visitstcloud.com/wp-json/tribe/events/v1/events?start_date=${startDate}&end_date=${endDate}&per_page=100&status=publish`

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

    console.log(`Manual sync complete. New: ${newEvents}, Updated: ${updatedEvents}, Errors: ${errors}`)

    return NextResponse.json({
      success: true,
      summary: {
        fetched: events.length,
        new: newEvents,
        updated: updatedEvents,
        errors: errors,
        dateRange: `${startDate} to ${endDate}`
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Manual events sync failed:', error)
    return NextResponse.json({
      error: 'Manual events sync failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}