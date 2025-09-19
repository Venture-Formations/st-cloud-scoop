import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

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
    const imageUrl = isGithubImage
      ? article.rss_post.image_url  // GitHub URLs are already complete
      : isLegacyHostedImage
        ? `https://stcscoop.com${article.rss_post.image_url}`
        : hasImage
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

function generateLocalEventsSection(eventsData: any[]): string {
  if (!eventsData || eventsData.length === 0) {
    return '' // Don't include section if no events
  }

  // Group events by date
  const eventsByDate: { [key: string]: any[] } = {}
  eventsData.forEach((ce: any) => {
    if (!eventsByDate[ce.event_date]) {
      eventsByDate[ce.event_date] = []
    }
    eventsByDate[ce.event_date].push(ce)
  })

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

  const formatEventTime = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    } catch (e) {
      return ''
    }
  }

  const dateGroupsHtml = Object.entries(eventsByDate)
    .sort(([a], [b]) => a.localeCompare(b)) // Sort dates chronologically
    .map(([date, events]) => {
      const featuredEvent = events.find(ce => ce.is_featured)
      const regularEvents = events.filter(ce => !ce.is_featured)

      // Generate featured event HTML
      const featuredHtml = featuredEvent ? `
<tr class='row'>
 <td class='column' style='padding:8px; vertical-align: top;'>
 <table width='100%' cellpadding='0' cellspacing='0' style='border: 2px solid #FFD700; border-radius: 8px; background: #FFFBF0; font-family: Arial, sans-serif; font-size: 16px; line-height: 26px; box-shadow:0 4px 12px rgba(255,215,0,.3);'>
 <tr><td style='padding: 8px 12px 4px; font-size: 12px; font-weight: bold; color: #B8860B; text-align: center;'>⭐ FEATURED EVENT</td></tr>
 <tr><td style='padding: 4px 12px 8px; font-size: 18px; font-weight: bold; text-align: center;'>${featuredEvent.event.title}</td></tr>
 ${featuredEvent.event.image_url ? `<tr><td style='padding: 0 12px; text-align: center;'><img src='${featuredEvent.event.image_url}' alt='${featuredEvent.event.title}' style='max-width: 100%; max-height: 300px; border-radius: 4px;'></td></tr>` : ''}
 <tr><td style='padding: 8px 12px 4px; font-size: 14px; font-weight: bold; color: #1877F2;'>${formatEventTime(featuredEvent.event.start_date)}</td></tr>
 ${featuredEvent.event.venue ? `<tr><td style='padding: 0 12px 4px; font-size: 14px;'>${featuredEvent.event.venue}</td></tr>` : ''}
 ${featuredEvent.event.address ? `<tr><td style='padding: 0 12px 4px; font-size: 12px; color: #666;'>${featuredEvent.event.address}</td></tr>` : ''}
 ${featuredEvent.event.description ? `<tr><td style='padding: 4px 12px 8px; font-size: 14px;'>${featuredEvent.event.description}</td></tr>` : ''}
 ${featuredEvent.event.url ? `<tr><td style='padding: 4px 12px 12px; text-align: center;'><a href='${featuredEvent.event.url}' style='color: #0080FE; text-decoration: none; font-weight: bold;'>Learn More</a></td></tr>` : ''}
 </table>
 </td>
</tr>` : ''

      // Generate regular events HTML
      const regularEventsHtml = regularEvents.map((ce: any) => `
<tr class='row'>
 <td class='column' style='padding:4px 8px; vertical-align: top;'>
 <table width='100%' cellpadding='0' cellspacing='0' style='border: 1px solid #ddd; border-radius: 6px; background: #fff; font-family: Arial, sans-serif; font-size: 14px; line-height: 20px;'>
 <tr><td style='padding: 8px 10px 4px; font-size: 16px; font-weight: bold;'>${ce.event.title}</td></tr>
 <tr><td style='padding: 0 10px 4px; font-size: 12px; font-weight: bold; color: #1877F2;'>${formatEventTime(ce.event.start_date)}</td></tr>
 ${ce.event.venue ? `<tr><td style='padding: 0 10px 4px; font-size: 12px;'>${ce.event.venue}</td></tr>` : ''}
 ${ce.event.url ? `<tr><td style='padding: 4px 10px 8px; text-align: right;'><a href='${ce.event.url}' style='color: #0080FE; text-decoration: none; font-size: 11px;'>Details</a></td></tr>` : '<tr><td style="padding: 4px;"></td></tr>'}
 </table>
 </td>
</tr>`).join('')

      return `
<tr>
  <td style="padding: 12px 5px 8px;">
    <h3 style="font-size: 1.2em; font-family: Arial, sans-serif; color: #1877F2; margin: 0; padding: 0; border-bottom: 2px solid #1877F2; padding-bottom: 4px;">${formatEventDate(date)}</h3>
  </td>
</tr>
${featuredHtml}
${regularEventsHtml}`
    }).join('')

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f7f7f7; border-radius: 10px; margin-top: 10px; max-width: 990px; margin: 0 auto; background-color: #f7f7f7; font-family: Arial, sans-serif;">
  <tr>
    <td style="padding: 5px;">
      <h2 style="font-size: 1.625em; line-height: 1.16em; font-family: Arial, sans-serif; color: #1877F2; margin: 0; padding: 0;">Local Events</h2>
    </td>
  </tr>
  ${dateGroupsHtml}
</table>
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

async function generateNewsletterHtml(campaign: any): Promise<string> {
  try {
    console.log('Generating HTML for campaign:', campaign?.id)

    // Filter active articles and sort by rank (custom order)
    const activeArticles = (campaign.articles || [])
      .filter((article: any) => article.is_active)
      .sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999))

    console.log('Active articles to render:', activeArticles.length)
    console.log('Article order:', activeArticles.map((a: any) => `${a.headline} (rank: ${a.rank})`).join(', '))

    // Filter selected events
    const eventsData = (campaign.campaign_events || [])
      .filter((ce: any) => ce.is_selected && ce.event)
      .sort((a: any, b: any) => (a.display_order || 999) - (b.display_order || 999))

    console.log('Selected events to render:', eventsData.length)
    console.log('Events data:', eventsData.map((ce: any) => `${ce.event.title} (${ce.event_date})`).join(', '))

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
        } else if (section.name === 'Local Events' && eventsData.length > 0) {
          sectionsHtml += generateLocalEventsSection(eventsData)
        }
      }
    } else {
      // Fallback to default order if no sections configured
      console.log('No sections found, using default order')
      sectionsHtml = generateLocalScoopSection(activeArticles) + generateLocalEventsSection(eventsData)
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