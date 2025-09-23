import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getWeatherForCampaign } from '@/lib/weather-manager'
import { selectPropertiesForCampaign, getSelectedPropertiesForCampaign } from '@/lib/vrbo-selector'
import { selectDiningDealsForCampaign, getDiningDealsForCampaign } from '@/lib/dining-selector'

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    console.log('Preview API called')
    const { id } = await props.params
    console.log('Campaign ID:', id)

    const session = await getServerSession(authOptions)
    console.log('Session check:', !!session?.user?.email)

    if (!session?.user?.email) {
      console.log('Authorization failed - no session')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Fetching campaign with ID:', id)
    // Fetch campaign with active articles and events
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select(`
        *,
        articles(
          id,
          headline,
          content,
          word_count,
          fact_check_score,
          is_active,
          rank,
          rss_post:rss_posts(
            source_url,
            image_url,
            rss_feed:rss_feeds(name)
          )
        ),
        campaign_events(
          id,
          event_date,
          is_selected,
          is_featured,
          display_order,
          event:events(
            id,
            title,
            description,
            start_date,
            end_date,
            venue,
            address,
            url,
            image_url
          )
        )
      `)
      .eq('id', id)
      .single()

    console.log('Campaign query result:', { campaign: !!campaign, error: campaignError })

    if (campaignError) {
      console.error('Campaign fetch error:', campaignError)
      return NextResponse.json({ error: `Campaign fetch failed: ${campaignError.message}` }, { status: 404 })
    }

    if (!campaign) {
      console.log('No campaign found')
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    console.log('Campaign found, articles count:', campaign.articles?.length || 0)
    console.log('Campaign events count:', campaign.campaign_events?.length || 0)

    // Filter to only active articles (max 5)
    if (campaign.articles) {
      const beforeFilter = campaign.articles.length
      campaign.articles = campaign.articles
        .filter((article: any) => article.is_active)
        .sort((a: any, b: any) => (b.rss_post?.post_rating?.[0]?.total_score || 0) - (a.rss_post?.post_rating?.[0]?.total_score || 0))
        .slice(0, 5) // Limit to 5 articles maximum
      console.log('Active articles after filter:', campaign.articles.length, 'from', beforeFilter, '(max 5)')
    }

    // Filter to only selected events and group by date
    const eventsData = (campaign.campaign_events || [])
      .filter((ce: any) => ce.is_selected && ce.event)
      .sort((a: any, b: any) => (a.display_order || 999) - (b.display_order || 999))
    console.log('Selected events after filter:', eventsData.length)

    console.log('Generating HTML newsletter')
    // Generate HTML newsletter
    const newsletterHtml = await generateNewsletterHtml(campaign)
    console.log('HTML generated, length:', newsletterHtml.length)

    return NextResponse.json({
      success: true,
      campaign,
      html: newsletterHtml
    })

  } catch (error) {
    console.error('Preview generation error:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      { error: `Failed to generate newsletter preview: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

function generateNewsletterHeader(formattedDate: string): string {
  return `<html>
<body style='margin:0!important;padding:0!important;background-color:#f7f7f7;'>
   <div style='width:100%;margin:0 auto;padding:10px;background-color:#f7f7f7;box-sizing:border-box;overflow-x:auto;'>
     <div style='width:100%;max-width:990px;margin:0 auto;padding:5px;text-align:right;font-weight:bold;'>
       <a href='{$url}' style='color:#000;text-decoration:underline;'>View Online</a>&nbsp;|&nbsp;
       <a href='https://stcscoop.com/' style='color:#000;text-decoration:underline;'>Sign Up</a>&nbsp;|&nbsp;
       <a href='{$forward}' style='color:#000;text-decoration:underline;'>Share</a>
     </div>
     <div style='width:100%;max-width:990px;margin:0 auto;padding:0px;'>
       <div style='font-family:Arial,sans-serif;background-color:#1877F2;text-align:center;border-radius:12px;border:1px solid #333;'>
         <img alt='St. Cloud Scoop' src='https://raw.githubusercontent.com/VFDavid/STCScoop/refs/heads/main/STCSCOOP_Logo_824X148_clear.png' style='width:100%;max-width:500px;height:auto;margin-bottom:2px;'/>
         <div style='color:#fff;font-size:16px;font-weight:bold;padding:0 0 5px;'>${formattedDate}</div>
       </div>
     </div>
   </div>
<br>`
}

function generateLocalScoopSection(articles: any[]): string {
  const articlesHtml = articles.map((article: any) => {
    // Debug logging for image URLs
    console.log(`Article: "${article.headline}" - Image URL: ${article.rss_post?.image_url || 'None'}`)

    // Check if article has any image URL (GitHub, hosted, or external)
    const hasImage = article.rss_post?.image_url
    const isLegacyHostedImage = hasImage && article.rss_post.image_url.startsWith('/images/')
    const isGithubImage = hasImage && (article.rss_post.image_url.includes('github.com') || article.rss_post.image_url.includes('githubusercontent.com'))

    console.log(`Has image: ${hasImage}, Is GitHub: ${isGithubImage}, Is legacy hosted: ${isLegacyHostedImage}`)

    // Use GitHub image if available, legacy hosted image, or external image
    // Skip Facebook URLs that are likely expired (contain expiration parameters)
    const isFacebookUrl = hasImage && article.rss_post.image_url.includes('fbcdn.net')
    const hasFacebookExpiration = isFacebookUrl && article.rss_post.image_url.includes('&oe=')

    const imageUrl = isGithubImage
      ? article.rss_post.image_url  // GitHub URLs are already complete
      : isLegacyHostedImage
        ? `https://stcscoop.com${article.rss_post.image_url}`
        : (hasImage && !hasFacebookExpiration)
          ? article.rss_post.image_url
          : null

    const imageHtml = imageUrl
      ? `<tr><td style='padding: 0 12px; text-align: center;'><img src='${imageUrl}' alt='${article.headline}' style='max-width: 100%; max-height: 500px; border-radius: 4px;'></td></tr>
<tr><td style='padding: 0 12px 12px; text-align: center; font-size: 12px; color: #555; font-style: italic;'>Photo by ${article.rss_post?.rss_feed?.name || 'Unknown Source'}</td></tr>`
      : ''

    console.log(`Image HTML: ${imageHtml ? 'Generated' : 'None'}`)

    return `
<tr class='row'>
 <td class='column' style='padding:8px; vertical-align: top;'>
 <table width='100%' cellpadding='0' cellspacing='0' style='border: 1px solid #ddd; border-radius: 8px; background: #fff; font-family: Arial, sans-serif; font-size: 16px; line-height: 26px; box-shadow:0 4px 12px rgba(0,0,0,.15);'>
 <tr><td style='padding: 12px 12px 4px; font-size: 20px; font-weight: bold;'>${article.headline}</td></tr>
 ${imageHtml}
 <tr><td style='padding: 0 12px 20px;'>${article.content} ${article.rss_post?.source_url ? `(<a href='${article.rss_post.source_url}' style='color: #0080FE; text-decoration: none;'>read more</a>)` : ''}</td></tr>
 </table>
 </td>
</tr>`
  }).join('');

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f7f7f7; border-radius: 10px; margin-top: 10px; max-width: 990px; margin: 0 auto; background-color: #f7f7f7; font-family: Arial, sans-serif;">
  <tr>
    <td style="padding: 5px;">
      <h2 style="font-size: 1.625em; line-height: 1.16em; font-family: Arial, sans-serif; color: #1877F2; margin: 0; padding: 0;">The Local Scoop</h2>
    </td>
  </tr>
  ${articlesHtml}
</table>
<br>`
}

async function generateLocalEventsSection(campaign: any): Promise<string> {
  // Calculate 3-day range starting from the newsletter date (campaign.date)
  // Day 1: Newsletter date, Day 2: Next day, Day 3: Day after that
  const newsletterDate = new Date(campaign.date + 'T00:00:00') // Parse as local date

  const dates = []
  for (let i = 0; i <= 2; i++) {
    const date = new Date(newsletterDate)
    date.setDate(newsletterDate.getDate() + i)
    dates.push(date.toISOString().split('T')[0])
  }

  console.log('HTML generation - calculated dates:', dates)

  // Fetch events for the calculated date range
  const startDate = dates[0]
  const endDate = dates[dates.length - 1]

  const { data: availableEvents } = await supabaseAdmin
    .from('events')
    .select('*')
    .gte('start_date', startDate)
    .lte('start_date', endDate + 'T23:59:59')
    .eq('active', true)
    .order('start_date', { ascending: true })

  if (!availableEvents || availableEvents.length === 0) {
    return '' // Don't include section if no events
  }

  console.log(`HTML generation - found ${availableEvents.length} events for date range ${startDate} to ${endDate}`)

  // Get the campaign events to determine which are selected and featured
  const { data: campaignEvents } = await supabaseAdmin
    .from('campaign_events')
    .select('*')
    .eq('campaign_id', campaign.id)

  const campaignEventsMap = new Map()
  campaignEvents?.forEach(ce => {
    const key = `${ce.event_id}_${ce.event_date}`
    campaignEventsMap.set(key, ce)
  })

  // Filter events by date and selection status
  const eventsByDate: { [key: string]: any[] } = {}

  dates.forEach(date => {
    // Filter events that occur on this date
    const dateStart = new Date(date + 'T00:00:00-05:00')
    const dateEnd = new Date(date + 'T23:59:59-05:00')

    const eventsForDate = availableEvents.filter(event => {
      const eventStart = new Date(event.start_date)
      const eventEnd = event.end_date ? new Date(event.end_date) : eventStart
      return (eventStart <= dateEnd && eventEnd >= dateStart)
    })

    // Only include events that are selected for the campaign
    const selectedEvents = eventsForDate
      .map(event => {
        const campaignEvent = campaignEventsMap.get(`${event.id}_${date}`)
        if (campaignEvent && campaignEvent.is_selected) {
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

    if (selectedEvents.length > 0) {
      eventsByDate[date] = selectedEvents
    }
  })

  console.log('HTML generation - events by date:', Object.keys(eventsByDate).map(date => `${date}: ${eventsByDate[date].length} events`))

  if (Object.keys(eventsByDate).length === 0) {
    return '' // Don't include section if no selected events
  }

  const formatEventDate = (dateString: string) => {
    try {
      const date = new Date(dateString + 'T00:00:00')
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      })
    } catch (e) {
      return dateString
    }
  }

  const formatEventTime = (startDate: string, endDate?: string) => {
    try {
      const start = new Date(startDate)
      const startTime = start.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).replace(':00', '').replace(' ', '')

      if (endDate) {
        const end = new Date(endDate)
        const endTime = end.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }).replace(':00', '').replace(' ', '')
        return `${startTime} → ${endTime}`
      }

      return startTime
    } catch (e) {
      return ''
    }
  }

  // Helper function to get event emoji based on title/venue
  const getEventEmoji = (title: string, venue: string) => {
    const titleLower = title.toLowerCase()
    const venueLower = venue ? venue.toLowerCase() : ''

    if (titleLower.includes('harvest') || titleLower.includes('corn maze') || titleLower.includes('farm')) return '🌽'
    if (titleLower.includes('art') || titleLower.includes('exhibition') || titleLower.includes('ceramic')) return '🎨'
    if (titleLower.includes('blacklight') || titleLower.includes('adventure')) return '🎯'
    if (titleLower.includes('farmers') || titleLower.includes('market')) return '🥕'
    if (titleLower.includes('skate') || titleLower.includes('skating')) return '🛼'
    if (titleLower.includes('carnival')) return '🎡'
    if (titleLower.includes('music') || titleLower.includes('concert') || venueLower.includes('amphitheater')) return '🎶'
    if (titleLower.includes('magic') || titleLower.includes('gathering') || titleLower.includes('commander')) return '🎲'
    if (titleLower.includes('run') || titleLower.includes('5k') || titleLower.includes('race')) return '🏃‍♂️'
    if (titleLower.includes('fall') || titleLower.includes('festival')) return '🍂'
    if (titleLower.includes('hockey')) return '🏒'
    if (titleLower.includes('pride')) return '🏳️‍🌈'
    if (titleLower.includes('beer') || titleLower.includes('oktoberfest') || titleLower.includes('brewing')) return '🍺'
    if (titleLower.includes('sensory') || titleLower.includes('kids') || titleLower.includes('children')) return '🧒'
    if (titleLower.includes('dungeons') || titleLower.includes('dragons')) return '🐉'
    if (titleLower.includes('theater') || titleLower.includes('play') || titleLower.includes('piggie')) return '🎭'
    if (titleLower.includes('bluegrass') || titleLower.includes('brews')) return '🎶'

    return '🎉' // Default emoji
  }

  // Generate each day column using the calculated dates in order
  const dayColumns = dates.map(date => {
    const events = eventsByDate[date] || []
    const featuredEvent = events.find(event => event.is_featured)
    const regularEvents = events.filter(event => !event.is_featured)

    // Generate featured event HTML
    const featuredHtml = featuredEvent ? `
    <tr>
      <td style='padding:0; border-top: 1px solid #eee;'>
        <div style='padding:8px 16px; background:#E8F0FE; border:2px solid #1877F2; border-radius:6px;'>
          <span style='font-size: 16px;'>${getEventEmoji(featuredEvent.title, featuredEvent.venue)} <strong>${featuredEvent.title}</strong></span><br>
          <span style='font-size:14px;'><a href='${featuredEvent.url || '#'}' style='color: #000; text-decoration: underline;'>${formatEventTime(featuredEvent.start_date, featuredEvent.end_date)}</a>  | ${featuredEvent.venue || 'TBA'}</span>${(featuredEvent.event_summary || featuredEvent.description) ? `<br><br><span style='font-size:13px;'>${featuredEvent.event_summary || featuredEvent.description}</span>` : ''}
        </div>
      </td>
    </tr>` : ''

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
<br>`
}

function generateNewsletterFooter(): string {
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
</body>
</html>`
}

async function generateWordleSection(campaign: any): Promise<string> {
  try {
    console.log('Generating Wordle section for campaign:', campaign?.id)

    // Get yesterday's date from the newsletter date (since this is for "Yesterday's Wordle")
    const newsletterDate = new Date(campaign.date + 'T00:00:00')
    const yesterday = new Date(newsletterDate)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayDate = yesterday.toISOString().split('T')[0]

    console.log('Looking for Wordle data for date:', yesterdayDate)

    // Fetch Wordle data for yesterday
    const { data: wordleData, error } = await supabaseAdmin
      .from('wordle')
      .select('*')
      .eq('date', yesterdayDate)
      .single()

    if (error || !wordleData) {
      console.log('No Wordle data found for yesterday:', yesterdayDate, 'excluding Wordle section')
      return '' // Don't include section if no data
    }

    console.log('Found Wordle data:', wordleData.word)

    // Generate the HTML using the template structure
    const wordleCard = `<table width='100%' cellpadding='0' cellspacing='0' style='border: 1px solid #ddd; border-radius: 12px; background-color: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.15); font-family: Arial, sans-serif; font-size: 16px; color: #333; line-height: 26px;'>
      <tr><td style='background-color: #F8F9FA; text-align: center; padding: 8px; font-weight: bold; font-size: 24px; color: #3C4043; text-transform: uppercase;'>${wordleData.word}</td></tr>
      <tr><td style='padding: 16px;'>
        <div style='margin-bottom: 12px;'><strong>Definition:</strong> ${wordleData.definition}</div>
        <div><strong>Interesting Fact:</strong> ${wordleData.interesting_fact}</div>
      </td></tr>
    </table>`

    const wordleColumn = `<td class='column' style='padding:8px; vertical-align: top;'>${wordleCard}</td>`

    return `
<table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f7f7f7; border-radius: 10px; margin-top: 10px; max-width: 990px; margin: 0 auto; background-color: #f7f7f7; font-family: Arial, sans-serif;">
  <tr>
    <td style="padding: 5px;">
      <h2 style="font-size: 1.625em; line-height: 1.16em; font-family: Arial, sans-serif; color: #1877F2; margin: 0; padding: 0;">Yesterday's Wordle</h2>
    </td>
  </tr>
  <tr class="row">${wordleColumn}</tr>
</table>
<br>`

  } catch (error) {
    console.error('Error generating Wordle section:', error)
    return '' // Return empty string on error to not break the newsletter
  }
}

async function generateMinnesotaGetawaysSection(campaign: any): Promise<string> {
  try {
    console.log('Generating Minnesota Getaways section for campaign:', campaign?.id)

    // Get selected properties for this campaign (or select them if not done yet)
    let selectedProperties = await getSelectedPropertiesForCampaign(campaign.id)

    if (selectedProperties.length === 0) {
      console.log('No properties selected yet, selecting now...')
      const selectionResult = await selectPropertiesForCampaign(campaign.id)
      selectedProperties = selectionResult.selected
      console.log(selectionResult.message)
    }

    if (selectedProperties.length === 0) {
      console.log('No VRBO properties available for Minnesota Getaways section')
      return '' // Don't include section if no properties
    }

    console.log(`Found ${selectedProperties.length} selected properties for Minnesota Getaways`)

    // Generate HTML for each property using the provided template
    let propertyCards = ''

    selectedProperties.forEach((property, index) => {
      // Clean and validate data
      const title = property.title || ''
      const imageUrl = property.adjusted_image_url || property.main_image_url || ''
      const city = property.city || ''
      const bedrooms = property.bedrooms || 0
      const bathrooms = property.bathrooms || 0
      const sleeps = property.sleeps || 0
      const link = property.link || ''

      // Skip if essential data is missing
      if (!title || !link) {
        console.log(`Skipping property ${index + 1} - missing title or link`)
        return
      }

      propertyCards += `
    <!-- CARD ${index + 1} -->
    <td class="column" width="33.33%" style="padding:8px;vertical-align:top;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="table-layout:fixed;border:1px solid #ddd;border-radius:8px;background:#fff;height:100%;font-size:16px;line-height:26px;box-shadow:0 4px 12px rgba(0,0,0,.15);">
        <!-- Image -->
        <tr>
          <!-- remove any gap above image -->
          <td style="padding:0;line-height:0;font-size:0;mso-line-height-rule:exactly;border-top-left-radius:8px;border-top-right-radius:8px;">
            <a href="${link}" style="display:block;text-decoration:none;">
              <img src="${imageUrl}"
                   alt="${title}, ${city}" border="0"
                   style="display:block;width:100%;height:auto;border:0;outline:none;text-decoration:none;border-top-left-radius:8px;border-top-right-radius:8px;">
            </a>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:6px 10px 6px;">
            <!-- 2-line clamp on desktop; mobile unlocks below -->
            <div class="vrbo-title" style="font-size:16px;line-height:20px;height:auto;overflow:hidden;font-weight:bold;margin:0 0 4px;">
              <a href="${link}" style="color:#0A66C2;text-decoration:none;">${title}</a>
            </div>
            <div style="font-size:13px;line-height:18px;color:#555;margin:0 0 8px;">${city}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;table-layout:fixed;">
              <tr>
                <td align="center" style="padding:4px 0;font-size:12px;color:#222;white-space:nowrap;"><strong>${bedrooms}</strong> BR</td>
                <td align="center" style="padding:4px 0;font-size:12px;color:#222;border-left:1px solid #eee;border-right:1px solid #eee;white-space:nowrap;"><strong>${bathrooms}</strong> BA</td>
                <td align="center" style="padding:4px 0;font-size:12px;color:#222;white-space:nowrap;">Sleeps <strong>${sleeps}</strong></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>`
    })

    return `
<table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f7f7f7; border-radius: 10px; margin-top: 10px; max-width: 990px; margin: 0 auto; background-color: #f7f7f7; font-family: Arial, sans-serif;">
  <tr>
    <td style="padding: 5px;">
      <h2 style="font-size: 1.625em; line-height: 1.16em; font-family: Arial, sans-serif; color: #1877F2; margin: 0; padding: 0;">Minnesota Getaways</h2>
    </td>
  </tr>
  <tr>
<tr class="row">${propertyCards}
</tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->

<!-- Mobile helpers: stack columns + allow long titles -->
<style>
@media only screen and (max-width:600px){
  .row .column{display:block !important;width:100% !important;max-width:100% !important;}
}
</style>
<!-- ===== /Minnesota Vrbo ===== -->
<br>`

  } catch (error) {
    console.error('Error generating Minnesota Getaways section:', error)
    return '' // Return empty string on error to not break the newsletter
  }
}

async function generateDiningDealsSection(campaign: any): Promise<string> {
  try {
    console.log('Generating Dining Deals section for campaign:', campaign.id)

    // Get campaign date to determine day of week
    const campaignDate = new Date(campaign.date + 'T00:00:00')
    const dayOfWeek = campaignDate.toLocaleDateString('en-US', { weekday: 'long' })

    console.log('Campaign date:', campaign.date, 'Day of week:', dayOfWeek)

    // Select or get existing dining deals for this campaign
    const result = await selectDiningDealsForCampaign(campaign.id, campaignDate)
    console.log('Dining deals selection result:', result.message)

    if (!result.deals || result.deals.length === 0) {
      console.log('No dining deals found for', dayOfWeek)
      return ''
    }

    // Format the campaign date for display
    const formattedDate = campaignDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })

    console.log('Generating HTML for', result.deals.length, 'dining deals')

    // Generate deals HTML
    let dealsHtml = ''

    result.deals.forEach((deal: any, index: number) => {
      const isFeatured = deal.is_featured || deal.is_featured_in_campaign || index === 0
      const businessName = deal.business_name || ''
      const specialDescription = deal.special_description || ''
      const specialTime = deal.special_time || ''
      const googleProfile = deal.google_profile || '#'

      if (isFeatured) {
        // Featured deal format (first_special)
        dealsHtml += `
          <tr><td style='padding: 8px 16px; background:#E8F0FE; border:2px solid #1877F2; border-radius:6px;'>
            <div style='font-weight: bold;'>${businessName}</div>
            <div>${specialDescription}</div>
            <div style='font-size: 14px;'><a href='${googleProfile}' style='text-decoration: underline; color: inherit;'>${specialTime}</a></div>
          </td></tr>`
      } else {
        // Subsequent deals format
        dealsHtml += `
          <tr><td style='padding: 8px 16px 4px; font-weight: bold; border-top: 1px solid #eee;'>${businessName}</td></tr>
          <tr><td style='padding: 0 16px 2px;'>${specialDescription}</td></tr>
          <tr><td style='padding: 0 16px 8px; font-size: 14px;'><a href='${googleProfile}' style='text-decoration: underline; color: inherit;'>${specialTime}</a></td></tr>`
      }
    })

    // Wrap in card format
    const cardHtml = `
      <table width='100%' cellpadding='0' cellspacing='0' style='table-layout: fixed; border: 1px solid #ddd; border-radius: 8px; background: #fff; font-family: Arial, sans-serif; font-size: 16px; line-height: 20px; box-shadow: 0 4px 12px rgba(0,0,0,.15);'>
        <tr><td style='background: #F8F9FA; padding: 8px; text-align: center; font-size: 16px; font-weight: normal; color: #3C4043; border-top-left-radius: 8px; border-top-right-radius: 8px;'>${formattedDate}</td></tr>
        ${dealsHtml}
      </table>`

    // Wrap in section format
    const sectionHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f7f7f7; border-radius: 10px; margin-top: 10px; max-width: 990px; margin: 0 auto; background-color: #f7f7f7; font-family: Arial, sans-serif;">
        <tr>
          <td style="padding: 5px;">
            <h2 style="font-size: 1.625em; line-height: 1.16em; font-family: Arial, sans-serif; color: #1877F2; margin: 0; padding: 0;">Dining Deals</h2>
          </td>
        </tr>
        <tr class="row">
          <td class='column' style='padding:8px; vertical-align: top;'>
            ${cardHtml}
          </td>
        </tr>
      </table><br>`

    console.log('Generated Dining Deals HTML, length:', sectionHtml.length)
    return sectionHtml

  } catch (error) {
    console.error('Error generating Dining Deals section:', error)
    return ''
  }
}

async function generateNewsletterHtml(campaign: any): Promise<string> {
  try {
    console.log('Generating HTML for campaign:', campaign?.id)

    // Filter active articles and sort by rank (custom order)
    const activeArticles = (campaign.articles || [])
      .filter((article: any) => article.is_active)
      .sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999))

    console.log('PREVIEW - Active articles to render:', activeArticles.length)
    console.log('PREVIEW - Article order:', activeArticles.map((a: any) => `${a.headline} (rank: ${a.rank})`).join(', '))
    console.log('PREVIEW - Raw article data:', activeArticles.map((a: any) => `ID: ${a.id}, Rank: ${a.rank}, Active: ${a.is_active}`).join(' | '))

    console.log('Generating events section using calculated dates...')

    // Fetch newsletter sections order
    const { data: sections } = await supabaseAdmin
      .from('newsletter_sections')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    console.log('Active newsletter sections:', sections?.map(s => `${s.name} (order: ${s.display_order})`).join(', '))

    const formatDate = (dateString: string) => {
      try {
        // Parse date as local date to avoid timezone offset issues
        const [year, month, day] = dateString.split('-').map(Number)
        const date = new Date(year, month - 1, day) // month is 0-indexed
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      } catch (e) {
        console.error('Date formatting error:', e)
        return dateString
      }
    }

    const formattedDate = formatDate(campaign.date)
    console.log('Formatted date:', formattedDate)

    // Generate modular HTML sections
    const header = generateNewsletterHeader(formattedDate)
    const footer = generateNewsletterFooter()

    // Generate sections in order based on database configuration
    let sectionsHtml = ''
    if (sections && sections.length > 0) {
      for (const section of sections) {
        if (section.name === 'The Local Scoop' && activeArticles.length > 0) {
          sectionsHtml += generateLocalScoopSection(activeArticles)
        } else if (section.name === 'Local Events') {
          sectionsHtml += await generateLocalEventsSection(campaign)
        } else if (section.name === 'Local Weather') {
          const weatherHtml = await getWeatherForCampaign(campaign.id)
          if (weatherHtml) {
            sectionsHtml += weatherHtml
          }
        } else if (section.name === "Yesterday's Wordle") {
          const wordleHtml = await generateWordleSection(campaign)
          if (wordleHtml) {
            sectionsHtml += wordleHtml
          }
        } else if (section.name === 'Minnesota Getaways') {
          const getawaysHtml = await generateMinnesotaGetawaysSection(campaign)
          if (getawaysHtml) {
            sectionsHtml += getawaysHtml
          }
        } else if (section.name === 'Dining Deals') {
          const diningHtml = await generateDiningDealsSection(campaign)
          if (diningHtml) {
            sectionsHtml += diningHtml
          }
        }
      }
    } else {
      // Fallback to default order if no sections configured
      console.log('No sections found, using default order')
      const wordleHtml = await generateWordleSection(campaign)
      const getawaysHtml = await generateMinnesotaGetawaysSection(campaign)
      sectionsHtml = generateLocalScoopSection(activeArticles) + await generateLocalEventsSection(campaign) + (wordleHtml || '') + (getawaysHtml || '')
    }

    // Combine all sections
    const html = header + sectionsHtml + footer

    console.log('HTML template generated successfully, length:', html.length)
    return html

  } catch (error) {
    console.error('HTML generation error:', error)
    throw new Error(`HTML generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}