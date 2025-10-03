// Shared newsletter template generation functions
// Used by both preview route and MailerLite service for consistency

import { supabaseAdmin } from './supabase'

// ==================== UTILITY FUNCTIONS ====================

export function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr)
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' })
  const month = date.toLocaleDateString('en-US', { month: 'long', timeZone: 'America/Chicago' })
  const day = date.getDate()
  return `${dayOfWeek}, ${month} ${day}`
}

export function formatEventTime(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)

  const formatTime = (date: Date) => {
    let hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12 || 12
    const minuteStr = minutes === 0 ? '' : `:${minutes.toString().padStart(2, '0')}`
    return `${hours}${minuteStr}${ampm}`
  }

  return `${formatTime(start)} - ${formatTime(end)}`
}

export function getEventEmoji(title: string, venue: string): string {
  const text = `${title} ${venue}`.toLowerCase()

  if (text.includes('music') || text.includes('concert') || text.includes('band')) return '🎵'
  if (text.includes('art') || text.includes('gallery') || text.includes('exhibit')) return '🎨'
  if (text.includes('food') || text.includes('dinner') || text.includes('lunch') || text.includes('breakfast')) return '🍽️'
  if (text.includes('kids') || text.includes('children') || text.includes('family')) return '👨‍👩‍👧‍👦'
  if (text.includes('beer') || text.includes('wine') || text.includes('brewery') || text.includes('winery')) return '🍺'
  if (text.includes('sport') || text.includes('game') || text.includes('hockey') || text.includes('baseball')) return '⚽'
  if (text.includes('theater') || text.includes('theatre') || text.includes('play') || text.includes('musical')) return '🎭'
  if (text.includes('festival') || text.includes('fair')) return '🎪'
  if (text.includes('market') || text.includes('farmers')) return '🛍️'
  if (text.includes('outdoor') || text.includes('nature') || text.includes('park')) return '🌳'

  return '📅'
}

// ==================== HEADER ====================

export function generateNewsletterHeader(formattedDate: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>St. Cloud Scoop Newsletter</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
  <div style="background-color: #f4f4f4; padding: 20px 10px;">
    <div style="max-width: 990px; margin: 0 auto;">
      <div style="text-align: center; padding: 20px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
        <img src="https://raw.githubusercontent.com/VFDavid/STCScoop/refs/heads/main/logo_light.png" alt="St. Cloud Scoop" style="max-width: 150px; height: auto; margin-bottom: 10px;">
        <p style="font-size: 20px; color: #333; margin: 10px 0 0;">${formattedDate}</p>
      </div>
`
}

// ==================== LOCAL SCOOP (ARTICLES) ====================

export function generateLocalScoopSection(articles: any[]): string {
  if (!articles || articles.length === 0) {
    return '<p style="text-align: center; color: #666;">No articles available</p>'
  }

  const articlesHtml = articles.map((article, index) => {
    const headline = article.headline || 'No headline'
    const content = article.content || ''
    const sourceUrl = article.rss_post?.source_url || '#'
    const imageUrl = article.rss_post?.image_url || ''
    const source = article.rss_post?.rss_feed?.name || 'Unknown Source'

    const rank = index + 1
    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`

    return `
      <div style="background: #fff; border-radius: 8px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 12px rgba(0,0,0,.15);">
        <h3 style="color: #1877F2; margin: 0 0 10px; font-size: 18px;">${rankEmoji} ${headline}</h3>
        ${imageUrl ? `<img src="${imageUrl}" alt="${headline}" style="width: 100%; max-width: 400px; height: auto; border-radius: 8px; margin-bottom: 10px; display: block;" />` : ''}
        <p style="color: #666; margin: 10px 0; font-size: 14px; line-height: 1.6;">${content.substring(0, 200)}...</p>
        <a href="${sourceUrl}" style="color: #1877F2; text-decoration: underline; font-weight: bold;">Read more</a>
        <p style="color: #999; font-size: 12px; margin: 10px 0 0;">Source: ${source}</p>
      </div>
    `
  }).join('')

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f7f7f7; border-radius: 10px; margin-top: 10px; max-width: 990px; margin: 0 auto; background-color: #f7f7f7;">
  <tr>
    <td style="padding: 5px;">
      <h2 style="font-size: 1.625em; line-height: 1.16em; font-family: Arial, sans-serif; color: #1877F2; margin: 0; padding: 0;">Local Scoop</h2>
    </td>
  </tr>
  <tr>
    <td style="padding: 10px;">
      ${articlesHtml}
    </td>
  </tr>
</table>
<br>`
}

// ==================== LOCAL EVENTS ====================

export async function generateLocalEventsSection(campaign: any): Promise<string> {
  console.log('Generating Local Events section for campaign:', campaign?.id)

  // Calculate the 3-day date range in Central Time
  const campaignDate = new Date(campaign.date + 'T00:00:00-05:00')
  const dates: string[] = []
  for (let i = 0; i < 3; i++) {
    const currentDate = new Date(campaignDate)
    currentDate.setDate(currentDate.getDate() + i)
    dates.push(currentDate.toISOString().split('T')[0])
  }

  const startDate = dates[0]
  const endDate = dates[2]

  console.log(`Looking for events between ${startDate} and ${endDate}`)

  // Fetch all active events in date range
  const { data: availableEvents } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('active', true)
    .gte('start_date', startDate + 'T00:00:00')
    .lte('start_date', endDate + 'T23:59:59')
    .order('start_date', { ascending: true })

  console.log(`Found ${availableEvents?.length || 0} events for date range ${startDate} to ${endDate}`)

  // Get the campaign events to determine which are selected and featured
  const { data: campaignEvents } = await supabaseAdmin
    .from('campaign_events')
    .select('*')
    .eq('campaign_id', campaign.id)

  // Create campaign events lookup
  const campaignEventsMap = new Map()
  campaignEvents?.forEach(ce => {
    const key = `${ce.event_id}_${ce.event_date}`
    campaignEventsMap.set(key, ce)
  })

  console.log('Campaign events loaded:', campaignEvents?.length || 0)

  // Filter events by date and selection status
  const eventsByDate: { [key: string]: any[] } = {}

  dates.forEach(date => {
    console.log(`Processing date: ${date}`)

    // Filter events that occur on this date
    const dateStart = new Date(date + 'T00:00:00-05:00')
    const dateEnd = new Date(date + 'T23:59:59-05:00')

    const eventsForDate = (availableEvents || []).filter(event => {
      const eventStart = new Date(event.start_date)
      const eventEnd = event.end_date ? new Date(event.end_date) : eventStart
      return (eventStart <= dateEnd && eventEnd >= dateStart)
    })

    console.log(`Found ${eventsForDate.length} available events for ${date}`)

    // Only include events that are selected for the campaign
    const selectedEvents = eventsForDate
      .map(event => {
        const lookupKey = `${event.id}_${date}`
        const campaignEvent = campaignEventsMap.get(lookupKey)

        if (campaignEvent && campaignEvent.is_selected) {
          console.log(`Including event: ${event.title} (featured: ${campaignEvent.is_featured}, order: ${campaignEvent.display_order})`)
          return {
            ...event,
            is_featured: campaignEvent.is_featured,
            display_order: campaignEvent.display_order
          }
        }
        return null
      })
      .filter(Boolean)
      .sort((a, b) => (a.display_order || 999) - (b.display_order || 999))

    console.log(`Selected ${selectedEvents.length} events for ${date}`)

    if (selectedEvents.length > 0) {
      eventsByDate[date] = selectedEvents
    }
  })

  console.log('Events by date:', Object.keys(eventsByDate).map(date => `${date}: ${eventsByDate[date].length} events`))

  if (Object.keys(eventsByDate).length === 0) {
    console.log('No events to display')
    return ''
  }

  // Generate each day column
  const dayColumns = dates.map(date => {
    const events = eventsByDate[date] || []
    const featuredEvents = events.filter(event => event.is_featured)
    const regularEvents = events.filter(event => !event.is_featured)

    // Generate featured events HTML (can be multiple)
    const featuredHtml = featuredEvents.map(featuredEvent => `
    <tr>
      <td style='padding:0; border-top: 1px solid #eee;'>
        <div style='padding:8px 16px; background:#E8F0FE; border:2px solid #1877F2; border-radius:6px;'>
          ${featuredEvent.cropped_image_url ? `
          <img src='${featuredEvent.cropped_image_url}' alt='${featuredEvent.title}' style='width:100%; max-width:400px; height:auto; object-fit:cover; border-radius:4px; border:1px solid #1877F2; display:block; margin-bottom:8px;' />
          <span style='font-size: 16px;'>${getEventEmoji(featuredEvent.title, featuredEvent.venue)} <strong>${featuredEvent.title}</strong></span><br>
          <span style='font-size:14px;'><a href='${featuredEvent.url || '#'}' style='color: #000; text-decoration: underline;'>${formatEventTime(featuredEvent.start_date, featuredEvent.end_date)}</a>  | ${featuredEvent.venue || 'TBA'}</span>${(featuredEvent.event_summary || featuredEvent.description) ? `<br><br><span style='font-size:13px;'>${featuredEvent.event_summary || featuredEvent.description}</span>` : ''}
          ` : `
          <span style='font-size: 16px;'>${getEventEmoji(featuredEvent.title, featuredEvent.venue)} <strong>${featuredEvent.title}</strong></span><br>
          <span style='font-size:14px;'><a href='${featuredEvent.url || '#'}' style='color: #000; text-decoration: underline;'>${formatEventTime(featuredEvent.start_date, featuredEvent.end_date)}</a>  | ${featuredEvent.venue || 'TBA'}</span>${(featuredEvent.event_summary || featuredEvent.description) ? `<br><br><span style='font-size:13px;'>${featuredEvent.event_summary || featuredEvent.description}</span>` : ''}
          `}
        </div>
      </td>
    </tr>`).join('')

    // Generate regular events HTML
    const regularEventsHtml = regularEvents.map((event: any) => `
    <tr>
      <td style='padding: 8px 16px; border-top: 1px solid #eee;'>
        <span style='font-size: 16px;'>${getEventEmoji(event.title, event.venue)} <strong>${event.title}</strong></span><br>
        <span style='font-size:14px;'><a href='${event.url || '#'}' style='color: #000; text-decoration: underline;'>${formatEventTime(event.start_date, event.end_date)}</a>  | ${event.venue || 'TBA'}</span>
      </td>
    </tr>`).join('')

    return `
<td class='column' style='padding:8px; vertical-align: top;'>
  <table width='100%' cellpadding='0' cellspacing='0' style='table-layout: fixed; border: 1px solid #ddd; border-radius: 8px; background: #fff; height: 100%; font-family: Arial, sans-serif; font-size: 16px; line-height: 26px; box-shadow:0 4px 12px rgba(0,0,0,.15);'>
    <tr>
      <td style='background: #F8F9FA; padding: 8px; text-align: center; font-weight: normal; font-size: 16px; line-height: 26px; color: #3C4043; border-top-left-radius: 8px; border-top-right-radius: 8px;'>${formatEventDate(date)}</td>
    </tr>
    ${featuredHtml}
    ${regularEventsHtml}
  </table>
</td>`
  }).join(' ')

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f7f7f7; border-radius: 10px; margin-top: 10px; max-width: 990px; margin: 0 auto; background-color: #f7f7f7; font-family: Arial, sans-serif;">
  <tr>
    <td style="padding: 5px;">
      <h2 style="font-size: 1.625em; line-height: 1.16em; font-family: Arial, sans-serif; color: #1877F2; margin: 0; padding: 0;">Local Events</h2>
    </td>
  </tr><tr class="row">${dayColumns}
</td></table>
<div style="text-align: center; padding: 20px 10px; max-width: 990px; margin: 0 auto;">
  <a href="https://events.stcscoop.com/events/view" style="display: inline-block; background-color: #1877F2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 0 10px; font-family: Arial, sans-serif;">View All Events</a>
  <a href="https://events.stcscoop.com/events/submit" style="display: inline-block; background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 0 10px; font-family: Arial, sans-serif;">Submit Your Event</a>
</div>
<br>`
}

// ==================== FOOTER ====================

export function generateNewsletterFooter(): string {
  return `
<div style="max-width: 990px; margin: 0 auto; background-color: #1877F2; padding: 8px 0; text-align: center;">
  <a href="https://www.facebook.com/61578947310955/" target="_blank">
    <img src="https://raw.githubusercontent.com/VFDavid/STCScoop/refs/heads/main/facebook_light.png" alt="Facebook" width="24" height="24" style="border: none; display: inline-block;">
  </a>
</div>
<div style="font-family: Arial, sans-serif; font-size: 12px; color: #777; text-align: center; padding: 20px 10px; border-top: 1px solid #ccc; background-color: #ffffff; max-width: 990px; margin: 0 auto ;">
  <p style="margin: 0;text-align: center;">You're receiving this email because you subscribed to <strong>St. Cloud Scoop</strong>.</p>
  <p style="margin: 5px 0 0;text-align: center;">
    <a href="{$unsubscribe}" style='text-decoration: underline;'>Unsubscribe</a>
  </p>
  <p style="margin: 5px;text-align: center;">©2025 Venture Formations LLC, all rights reserved</p>
</div>
    </div>
  </div>
</div>
</body>
</html>`
}
