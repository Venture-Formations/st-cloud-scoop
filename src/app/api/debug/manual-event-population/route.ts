import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    console.log('=== MANUAL EVENT POPULATION ===')

    // Get latest campaign
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select('id, date, status, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({
        success: false,
        error: 'No campaign found'
      }, { status: 404 })
    }

    console.log('Populating events for campaign:', campaign.id, 'Date:', campaign.date)

    // Calculate 3-day range starting from campaign date
    const campaignCreated = new Date(campaign.created_at)
    const centralTimeOffset = -5 * 60 * 60 * 1000
    const campaignCreatedCentral = new Date(campaignCreated.getTime() + centralTimeOffset)
    const startDateTime = new Date(campaignCreatedCentral.getTime() + (12 * 60 * 60 * 1000))

    const dates = []
    for (let i = 0; i <= 2; i++) {
      const date = new Date(startDateTime)
      date.setDate(startDateTime.getDate() + i)
      dates.push(date.toISOString().split('T')[0])
    }

    const startDate = dates[0]
    const endDate = dates[dates.length - 1]

    console.log('Looking for events between:', startDate, 'and', endDate)

    // Get available events for the date range
    const { data: availableEvents, error: eventsError } = await supabaseAdmin
      .from('events')
      .select('*')
      .gte('start_date', startDate)
      .lte('start_date', endDate + 'T23:59:59')
      .eq('active', true)
      .order('start_date', { ascending: true })

    console.log('Found available events:', availableEvents?.length || 0)

    if (!availableEvents || availableEvents.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No events found in date range',
        campaign,
        dateRange: { startDate, endDate, dates },
        eventsFound: 0
      })
    }

    // Clear existing campaign events
    const { error: clearError } = await supabaseAdmin
      .from('campaign_events')
      .delete()
      .eq('campaign_id', campaign.id)

    if (clearError) {
      console.error('Error clearing existing campaign events:', clearError)
    }

    // Group events by date
    const eventsByDate: Record<string, any[]> = {}
    availableEvents.forEach(event => {
      const eventDate = event.start_date.split('T')[0]
      if (!eventsByDate[eventDate]) {
        eventsByDate[eventDate] = []
      }
      eventsByDate[eventDate].push(event)
    })

    // Limit to 6 events per day and sort by time
    Object.keys(eventsByDate).forEach(date => {
      const eventsForDate = eventsByDate[date]
      if (eventsForDate.length > 6) {
        eventsByDate[date] = eventsForDate
          .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
          .slice(0, 6)
      }
    })

    // Insert campaign events
    const campaignEventsData: any[] = []
    let totalSelected = 0

    Object.entries(eventsByDate).forEach(([date, events]) => {
      events.forEach((event, index) => {
        campaignEventsData.push({
          campaign_id: campaign.id,
          event_id: event.id,
          event_date: date,
          is_selected: true,
          is_featured: index === 0, // First event of each day is featured
          display_order: index + 1
        })
        totalSelected++
      })
    })

    console.log('Inserting', campaignEventsData.length, 'campaign events')

    const { error: insertError } = await supabaseAdmin
      .from('campaign_events')
      .insert(campaignEventsData)

    if (insertError) {
      console.error('Error inserting campaign events:', insertError)
      return NextResponse.json({
        success: false,
        error: 'Failed to insert campaign events',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Events populated successfully',
      campaign,
      dateRange: { startDate, endDate, dates },
      eventsFound: availableEvents.length,
      eventsSelected: totalSelected,
      eventsByDate: Object.keys(eventsByDate).map(date => ({
        date,
        count: eventsByDate[date].length,
        events: eventsByDate[date].map(e => ({ id: e.id, title: e.title }))
      })),
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Manual event population error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}