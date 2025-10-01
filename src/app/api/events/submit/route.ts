import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendSlackNotification } from '@/lib/slack'

export async function POST(request: NextRequest) {
  try {
    const { events } = await request.json()

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({
        error: 'No events provided'
      }, { status: 400 })
    }

    const insertedEvents = []

    // Insert each event
    for (const event of events) {
      const { data, error } = await supabaseAdmin
        .from('events')
        .insert([{
          title: event.title,
          description: event.description,
          start_date: event.start_date,
          end_date: event.end_date,
          venue: event.venue,
          address: event.address,
          url: event.url,
          image_url: event.cropped_image_url,
          original_image_url: event.original_image_url,
          cropped_image_url: event.cropped_image_url,
          submitter_name: event.submitter_name,
          submitter_email: event.submitter_email,
          submitter_phone: event.submitter_phone,
          submission_status: event.submission_status || 'pending',
          paid_placement: event.paid_placement || false,
          featured: event.featured || false,
          active: event.active !== false,
          payment_status: event.payment_status || null,
          payment_intent_id: event.payment_intent_id || null,
          payment_amount: event.payment_amount || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (error) {
        console.error('Error inserting event:', error)
        throw error
      }

      insertedEvents.push(data)
    }

    // Send Slack notification for new submissions
    const totalAmount = events.reduce((sum: number, e: any) => {
      if (e.paid_placement) return sum + 5
      if (e.featured) return sum + 15
      return sum
    }, 0)

    const submitter = events[0]
    const eventTitles = events.map((e: any) => e.title).join('\n  • ')

    await sendSlackNotification({
      channel: process.env.SLACK_CHANNEL || '#general',
      message: `🎉 New Event Submission${events.length > 1 ? 's' : ''}!`,
      fields: [
        {
          title: 'Submitted by',
          value: `${submitter.submitter_name}\n${submitter.submitter_email}${submitter.submitter_phone ? `\n${submitter.submitter_phone}` : ''}`,
          short: true
        },
        {
          title: 'Total Amount',
          value: totalAmount > 0 ? `$${totalAmount.toFixed(2)}` : 'Free Listing',
          short: true
        },
        {
          title: `Event${events.length > 1 ? 's' : ''} (${events.length})`,
          value: `  • ${eventTitles}`,
          short: false
        }
      ],
      actions: [
        {
          type: 'button',
          text: 'Review Submissions',
          url: `${process.env.NEXT_PUBLIC_URL || 'https://st-cloud-scoop.vercel.app'}/dashboard/events/review`
        }
      ]
    })

    return NextResponse.json({
      success: true,
      events: insertedEvents
    })

  } catch (error) {
    console.error('Event submission failed:', error)
    return NextResponse.json({
      error: 'Event submission failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
