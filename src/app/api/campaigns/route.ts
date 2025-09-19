import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { authOptions } from '@/lib/auth'

// Helper function to initialize random event selection for a new campaign
async function initializeRandomEventSelection(campaignId: string, campaignDate: string) {
  try {
    console.log(`Initializing random event selection for campaign ${campaignId} on ${campaignDate}`)

    // Calculate 3-day range: 12 hours after campaign creation timestamp (which is campaign date)
    const baseDate = new Date(campaignDate + 'T00:00:00')
    baseDate.setHours(baseDate.getHours() + 12) // Add 12 hours as specified

    const dates = []
    for (let i = 0; i < 3; i++) {
      const date = new Date(baseDate)
      date.setDate(baseDate.getDate() + i)
      dates.push(date.toISOString().split('T')[0])
    }

    console.log('Event selection dates:', dates)

    // For each date, fetch available events and randomly select up to 8
    for (const eventDate of dates) {
      const dateStart = new Date(eventDate + 'T00:00:00')
      const dateEnd = new Date(eventDate + 'T23:59:59')

      // Fetch events for this date
      const { data: availableEvents, error: eventsError } = await supabaseAdmin
        .from('events')
        .select('*')
        .eq('active', true)
        .gte('start_date', dateStart.toISOString())
        .lte('start_date', dateEnd.toISOString())
        .order('start_date', { ascending: true })

      if (eventsError) {
        console.error('Error fetching events for date', eventDate, eventsError)
        continue
      }

      if (!availableEvents || availableEvents.length === 0) {
        console.log('No events found for date:', eventDate)
        continue
      }

      console.log(`Found ${availableEvents.length} events for ${eventDate}`)

      // Separate featured and non-featured events
      const featuredEvents = availableEvents.filter(event => event.featured)
      const nonFeaturedEvents = availableEvents.filter(event => !event.featured)

      // Randomly shuffle non-featured events
      const shuffledEvents = nonFeaturedEvents.sort(() => Math.random() - 0.5)

      // Select events: all featured events + random non-featured up to 8 total
      const selectedEvents = []

      // Add featured events first (they should always be selected if they exist)
      featuredEvents.forEach(event => {
        if (selectedEvents.length < 8) {
          selectedEvents.push(event)
        }
      })

      // Add random non-featured events to fill up to 8
      shuffledEvents.forEach(event => {
        if (selectedEvents.length < 8) {
          selectedEvents.push(event)
        }
      })

      console.log(`Selected ${selectedEvents.length} events for ${eventDate}`)

      // Insert campaign_events records
      const campaignEventInserts = selectedEvents.map((event, index) => ({
        campaign_id: campaignId,
        event_id: event.id,
        event_date: eventDate,
        is_selected: true,
        is_featured: event.featured, // Use the event's featured status from database
        display_order: index + 1
      }))

      if (campaignEventInserts.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('campaign_events')
          .insert(campaignEventInserts)

        if (insertError) {
          console.error('Error inserting campaign events for date', eventDate, insertError)
        } else {
          console.log(`Successfully inserted ${campaignEventInserts.length} campaign events for ${eventDate}`)
        }
      }
    }

    console.log('Random event selection initialization completed')
  } catch (error) {
    console.error('Error initializing random event selection:', error)
    // Don't throw error to prevent campaign creation from failing
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '10')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const status = url.searchParams.get('status')

    let query = supabaseAdmin
      .from('newsletter_campaigns')
      .select(`
        *,
        articles:articles(
          count
        ),
        manual_articles:manual_articles(
          count
        ),
        email_metrics(*)
      `)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: campaigns, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({
      campaigns: campaigns || [],
      total: campaigns?.length || 0
    })

  } catch (error) {
    console.error('Failed to fetch campaigns:', error)
    return NextResponse.json({
      error: 'Failed to fetch campaigns',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { date } = body

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }

    // Check if campaign already exists for this date
    const { data: existing } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select('id')
      .eq('date', date)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Campaign already exists for this date' }, { status: 409 })
    }

    // Create new campaign
    const { data: campaign, error } = await supabaseAdmin
      .from('newsletter_campaigns')
      .insert([{
        date,
        status: 'draft'
      }])
      .select('*')
      .single()

    if (error) {
      throw error
    }

    // Initialize random event selection for the new campaign
    await initializeRandomEventSelection(campaign.id, date)

    return NextResponse.json({ campaign }, { status: 201 })

  } catch (error) {
    console.error('Failed to create campaign:', error)
    return NextResponse.json({
      error: 'Failed to create campaign',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}