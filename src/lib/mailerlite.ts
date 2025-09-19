import axios from 'axios'
import { supabaseAdmin } from './supabase'
import { ErrorHandler, SlackNotificationService } from './slack'
import type { CampaignWithArticles, CampaignWithEvents, Article } from '@/types/database'

const MAILERLITE_API_BASE = 'https://connect.mailerlite.com/api'

const mailerliteClient = axios.create({
  baseURL: MAILERLITE_API_BASE,
  headers: {
    'Authorization': `Bearer ${process.env.MAILERLITE_API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

export class MailerLiteService {
  private errorHandler: ErrorHandler
  private slack: SlackNotificationService

  constructor() {
    this.errorHandler = new ErrorHandler()
    this.slack = new SlackNotificationService()
  }

  async createReviewCampaign(campaign: CampaignWithEvents, forcedSubjectLine?: string) {
    try {
      console.log(`Creating review campaign for ${campaign.date}`)

      const emailContent = await this.generateEmailHTML(campaign, true)

      // Log subject line status
      console.log('Campaign subject line:', campaign.subject_line)
      console.log('Forced subject line parameter:', forcedSubjectLine)

      // Use forced subject line if provided, otherwise fall back to campaign subject line
      const subjectLine = forcedSubjectLine || campaign.subject_line || `Newsletter Review - ${new Date(campaign.date).toLocaleDateString()}`

      console.log('Final subject line being sent to MailerLite:', subjectLine)

      const campaignData = {
        name: `Review: ${campaign.date}`,
        type: 'regular',
        emails: [{
          subject: `🍦 ${subjectLine}`,
          from_name: 'St. Cloud Scoop',
          from: 'scoop@stcscoop.com',
          content: emailContent,
        }],
        groups: [process.env.MAILERLITE_REVIEW_GROUP_ID],
        delivery_schedule: {
          type: 'scheduled',
          delivery: this.getReviewDeliveryTime(campaign.date)
        }
      }

      console.log('Sending MailerLite API request with data:', JSON.stringify(campaignData, null, 2))

      const response = await mailerliteClient.post('/campaigns', campaignData)

      console.log('MailerLite API response:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data
      })

      if (response.status === 201) {
        const campaignId = response.data.data.id

        // Update campaign with review sent timestamp
        await supabaseAdmin
          .from('newsletter_campaigns')
          .update({
            status: 'in_review',
            review_sent_at: new Date().toISOString()
          })
          .eq('id', campaign.id)

        await this.errorHandler.logInfo('Review campaign created successfully', {
          campaignId: campaign.id,
          mailerliteCampaignId: campaignId
        }, 'mailerlite_service')

        await this.slack.sendEmailCampaignAlert('review', true, campaign.id)

        return { success: true, campaignId }
      }

      throw new Error('Failed to create review campaign')

    } catch (error) {
      console.error('MailerLite API error details:', error)

      // Extract more specific error information
      let errorMessage = 'Unknown error'
      let errorDetails = {}

      if (error instanceof Error) {
        errorMessage = error.message
        if ('response' in error && error.response) {
          const axiosError = error as any
          console.error('MailerLite API error response:', {
            status: axiosError.response?.status,
            statusText: axiosError.response?.statusText,
            data: axiosError.response?.data,
            headers: axiosError.response?.headers
          })
          errorDetails = {
            status: axiosError.response?.status,
            statusText: axiosError.response?.statusText,
            apiError: axiosError.response?.data
          }
          errorMessage = `MailerLite API Error: ${axiosError.response?.status} - ${JSON.stringify(axiosError.response?.data)}`
        }
      }

      await this.errorHandler.handleError(error, {
        source: 'mailerlite_service',
        operation: 'createReviewCampaign',
        campaignId: campaign.id,
        errorDetails
      })
      await this.slack.sendEmailCampaignAlert('review', false, campaign.id, errorMessage)
      throw new Error(errorMessage)
    }
  }


  async importCampaignMetrics(campaignId: string) {
    try {
      const { data: metrics } = await supabaseAdmin
        .from('email_metrics')
        .select('mailerlite_campaign_id')
        .eq('campaign_id', campaignId)
        .single()

      if (!metrics?.mailerlite_campaign_id) {
        throw new Error('MailerLite campaign ID not found')
      }

      const response = await mailerliteClient.get(`/campaigns/${metrics.mailerlite_campaign_id}/reports`)

      if (response.status === 200) {
        const data = response.data.data

        const metricsUpdate = {
          sent_count: data.sent || 0,
          delivered_count: data.delivered || 0,
          opened_count: data.opened?.count || 0,
          clicked_count: data.clicked?.count || 0,
          bounced_count: data.bounced?.count || 0,
          unsubscribed_count: data.unsubscribed?.count || 0,
          open_rate: data.opened?.rate || 0,
          click_rate: data.clicked?.rate || 0,
          bounce_rate: data.bounced?.rate || 0,
          unsubscribe_rate: data.unsubscribed?.rate || 0,
        }

        await supabaseAdmin
          .from('email_metrics')
          .update(metricsUpdate)
          .eq('campaign_id', campaignId)

        return metricsUpdate
      }

      throw new Error('Failed to fetch metrics from MailerLite')

    } catch (error) {
      await this.logError('Failed to import campaign metrics', {
        campaignId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  private shouldIncludeEventsSection(sections: any[] | null): boolean {
    if (!sections || sections.length === 0) {
      return true // Include by default if no section config
    }

    return sections.some(section => section.name === 'Local Events')
  }

  private async generateEmailHTML(campaign: CampaignWithEvents, isReview: boolean): Promise<string> {
    // Filter active articles and sort by rank (custom order)
    const activeArticles = campaign.articles
      .filter(article => article.is_active)
      .sort((a, b) => (a.rank || 999) - (b.rank || 999))

    console.log('MailerLite - Active articles to render:', activeArticles.length)
    console.log('MailerLite - Article order:', activeArticles.map(a => `${a.headline} (rank: ${a.rank})`).join(', '))

    // Filter selected events
    const eventsData = (campaign.campaign_events || [])
      .filter((ce: any) => ce.is_selected && ce.event)
      .sort((a: any, b: any) => (a.display_order || 999) - (b.display_order || 999))

    console.log('MailerLite - Selected events to render:', eventsData.length)
    console.log('MailerLite - Events data:', eventsData.map((ce: any) => `${ce.event.title} (${ce.event_date})`).join(', '))

    // Fetch newsletter sections order
    const { data: sections } = await supabaseAdmin
      .from('newsletter_sections')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    console.log('MailerLite - Active newsletter sections:', sections?.map(s => `${s.name} (order: ${s.display_order})`).join(', '))

    // Use the same format as the preview template with local date parsing
    const [year, month, day] = campaign.date.split('-').map(Number)
    const date = new Date(year, month - 1, day) // month is 0-indexed
    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    // Review header for review campaigns - now at very top
    const reviewHeaderTop = isReview ? `
<table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f7f7f7; border-radius: 10px; margin: 10px auto; max-width: 990px; background-color: #FEF3C7; font-family: Arial, sans-serif;">
  <tr>
    <td style="padding: 12px; text-align: center;">
      <h3 style="margin: 0; color: #92400E; font-size: 18px; font-weight: bold;">📝 Newsletter Review</h3>
      <p style="margin: 8px 0 0 0; color: #92400E; font-size: 14px;">
        This is a preview of tomorrow's newsletter. Please review and make any necessary changes in the dashboard.
      </p>
    </td>
  </tr>
</table>
<br>` : ''

    // Generate articles using the same template as preview
    const articlesHtml = activeArticles.map((article: any) => {
      // Handle image URLs same as preview
      const hasImage = article.rss_post?.image_url
      const isLegacyHostedImage = hasImage && article.rss_post.image_url.startsWith('/images/')
      const isGithubImage = hasImage && (article.rss_post.image_url.includes('github.com') || article.rss_post.image_url.includes('githubusercontent.com'))

      const imageUrl = isGithubImage
        ? article.rss_post.image_url
        : isLegacyHostedImage
          ? `https://stcscoop.com${article.rss_post.image_url}`
          : hasImage
            ? article.rss_post.image_url
            : null

      const imageHtml = imageUrl
        ? `<tr><td style='padding: 0 12px; text-align: center;'><img src='${imageUrl}' alt='${article.headline}' style='max-width: 100%; max-height: 500px; border-radius: 4px;'></td></tr>
<tr><td style='padding: 0 12px 12px; text-align: center; font-size: 12px; color: #555; font-style: italic;'>Photo by ${article.rss_post?.rss_feed?.name || 'Unknown Source'}</td></tr>`
        : ''

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
    }).join('')

    // Generate events HTML using the same logic as preview
    const generateEventsHTML = (eventsData: any[]) => {
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

    const eventsHtml = generateEventsHTML(eventsData)

    // Use exact same template as preview with review banner at top and global email rules
    return `<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      background-color: #f7f7f7;
      font-family: Arial, sans-serif;
      color: #000;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    .row-content {
      max-width: 600px;
      margin: 0 auto;
      background-color: #e0f0ff;
    }
    .stack .column {
      display: inline-block;
      vertical-align: top;
    }
    .mobile_hide {
      display: block;
    }
    .desktop_hide {
      display: none;
      max-height: 0;
      overflow: hidden;
    }
    @media (max-width: 620px) {
      .row-content {
        width: 100% !important;
      }
      .stack .column {
        width: 100% !important;
        display: block !important;
      }
      .mobile_hide {
        display: none !important;
      }
      .desktop_hide {
        display: table !important;
        max-height: none !important;
      }
    }
    @media only screen and (max-width: 620px) {
      body, table, td, div {
        padding-left: 5px !important;
        padding-right: 5px !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }
      .row {
        display: block !important;
        width: 100% !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
      .column {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        padding-left: 4px !important;
        padding-right: 4px !important;
        box-sizing: border-box !important;
      }
    }
    @media only screen and (min-width: 621px) {
      .row {
        display: table !important;
        width: 100% !important;
        table-layout: fixed !important;
      }
      .column {
        display: table-cell !important;
        width: 33.33% !important;
        vertical-align: top;
        box-sizing: border-box !important;
        padding: 8px !important;
      }
    }
    @media only screen and (max-width: 620px) {
      .event-card {
        width: 100% !important;
        max-width: 100% !important;
      }
    }
    @media only screen and (max-width:620px){
      .weather-desktop{display:none!important;max-height:0!important;overflow:hidden!important;}
      .weather-mobile{display:table!important;max-height:none!important;width:100%!important;}
      .weather-mobile .wxcol{display:block!important;width:100%!important;max-width:100%!important;padding:4px 0!important;}
      .weather-mobile .weather-card{width:100%!important;max-width:100%!important;margin:0 auto!important;}
    }
    @media only screen and (min-width:621px){
      .weather-mobile{display:none!important;max-height:0!important;overflow:hidden!important;}
    }
    @media only screen and (min-width:621px){
      .etsy-wrap{font-size:0 !important;}
      .etsy-col{display:inline-block !important; width:25% !important; max-width:25% !important; vertical-align:top !important;}
      .etsy-pad{padding:8px !important;}
    }
  </style>
  <title>St. Cloud Scoop Newsletter</title>
</head>
<body style='margin:0!important;padding:0!important;background-color:#f7f7f7;'>
${reviewHeaderTop}
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
<br>
<table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f7f7f7; border-radius: 10px; margin-top: 10px; max-width: 990px; margin: 0 auto; background-color: #f7f7f7; font-family: Arial, sans-serif;">
  <tr>
    <td style="padding: 5px;">
      <h2 style="font-size: 1.625em; line-height: 1.16em; font-family: Arial, sans-serif; color: #1877F2; margin: 0; padding: 0;">The Local Scoop</h2>
    </td>
  </tr>
  ${articlesHtml}
</table>
<br>
${this.shouldIncludeEventsSection(sections) ? (eventsHtml || '') : ''}
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

  private getScheduledDeliveryTime(date: string): string {
    // Schedule for 4:55 AM CT on the campaign date
    const deliveryDate = new Date(date)
    deliveryDate.setHours(4, 55, 0, 0)

    // Convert to UTC (CT is UTC-6 or UTC-5 depending on DST)
    const utcTime = new Date(deliveryDate.getTime() + (6 * 60 * 60 * 1000))

    return utcTime.toISOString()
  }

  private getReviewDeliveryTime(date: string): string {
    // Schedule for 9:00 PM CT on the campaign date
    const deliveryDate = new Date(date)
    deliveryDate.setHours(21, 0, 0, 0) // 9:00 PM

    // Convert to UTC (CT is UTC-6 or UTC-5 depending on DST)
    const utcTime = new Date(deliveryDate.getTime() + (6 * 60 * 60 * 1000))

    return utcTime.toISOString()
  }

  async createFinalCampaign(campaign: CampaignWithEvents, mainGroupId: string) {
    try {
      console.log(`Creating final campaign for ${campaign.date}`)

      const emailContent = await this.generateEmailHTML(campaign, false) // Not a review

      const subjectLine = campaign.subject_line || `Newsletter - ${new Date(campaign.date).toLocaleDateString()}`

      console.log('Creating final campaign with subject line:', subjectLine)

      const campaignData = {
        name: `Newsletter: ${campaign.date}`,
        type: 'regular',
        emails: [{
          subject: `🍦 ${subjectLine}`,
          from_name: 'St. Cloud Scoop',
          from: 'scoop@stcscoop.com',
          content: emailContent,
        }],
        groups: [mainGroupId],
        delivery_schedule: {
          type: 'instant'
        }
      }

      console.log('Creating MailerLite campaign with data:', {
        name: campaignData.name,
        subject: campaignData.emails[0].subject,
        groupId: mainGroupId
      })

      const response = await mailerliteClient.post('/campaigns', campaignData)

      if (response.data && response.data.data && response.data.data.id) {
        const campaignId = response.data.data.id

        console.log('Final campaign created successfully:', campaignId)

        await this.logInfo('Final campaign created successfully', {
          campaignId: campaign.id,
          mailerliteCampaignId: campaignId,
          mainGroupId: mainGroupId
        })

        await this.slack.sendEmailCampaignAlert('final', true, campaign.id)

        return { success: true, campaignId }
      }

      throw new Error('Failed to create final campaign')

    } catch (error) {
      console.error('Failed to create final campaign:', error)

      if (error instanceof Error) {
        await this.logError('Failed to create final campaign', {
          error: error.message,
          campaignId: campaign.id,
          mainGroupId: mainGroupId
        })

        await this.slack.sendEmailCampaignAlert('final', false, campaign.id, error.message)
      }

      throw error
    }
  }

  private async logInfo(message: string, context: Record<string, any> = {}) {
    await supabaseAdmin
      .from('system_logs')
      .insert([{
        level: 'info',
        message,
        context,
        source: 'mailerlite_service'
      }])
  }

  private async logError(message: string, context: Record<string, any> = {}) {
    await supabaseAdmin
      .from('system_logs')
      .insert([{
        level: 'error',
        message,
        context,
        source: 'mailerlite_service'
      }])
  }
}