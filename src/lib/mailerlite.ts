import axios from 'axios'
import { supabaseAdmin } from './supabase'
import { ErrorHandler, SlackNotificationService } from './slack'
import type { CampaignWithArticles, CampaignWithEvents, Article } from '@/types/database'
import { getWeatherForCampaign } from './weather-manager'
import { selectPropertiesForCampaign, getSelectedPropertiesForCampaign } from './vrbo-selector'
import { selectDiningDealsForCampaign, getDiningDealsForCampaign } from './dining-selector'

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
        groups: [process.env.MAILERLITE_REVIEW_GROUP_ID]
        // Note: Removed delivery_schedule - we'll schedule separately after creation
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
        console.log('Campaign created successfully with ID:', campaignId)

        // Step 2: Schedule the campaign using the campaign ID
        try {
          const scheduleData = await this.getReviewScheduleData(campaign.date)
          console.log('Scheduling campaign with data:', scheduleData)

          const scheduleResponse = await mailerliteClient.post(`/campaigns/${campaignId}/schedule`, scheduleData)

          console.log('MailerLite schedule response:', {
            status: scheduleResponse.status,
            statusText: scheduleResponse.statusText,
            data: scheduleResponse.data
          })

          if (scheduleResponse.status === 200 || scheduleResponse.status === 201) {
            console.log('Campaign scheduled successfully')
          } else {
            console.error('Failed to schedule campaign:', scheduleResponse.status, scheduleResponse.data)
          }
        } catch (scheduleError) {
          console.error('Error scheduling campaign:', scheduleError)
          // Don't fail the whole process if scheduling fails - campaign is still created
        }

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


  private async generateEmailHTML(campaign: CampaignWithEvents, isReview: boolean): Promise<string> {
    // Filter active articles and sort by rank (custom order)
    const activeArticles = campaign.articles
      .filter(article => article.is_active)
      .sort((a, b) => (a.rank || 999) - (b.rank || 999))

    console.log('MAILERLITE - Active articles to render:', activeArticles.length)
    console.log('MAILERLITE - Article order:', activeArticles.map(a => `${a.headline} (rank: ${a.rank})`).join(', '))
    console.log('MAILERLITE - Raw article data:', activeArticles.map(a => `ID: ${a.id}, Rank: ${a.rank}, Active: ${a.is_active}`).join(' | '))

    // Generate events using the same logic as preview
    const eventsHtml = await this.generateLocalEventsSection(campaign)

    console.log('MailerLite - Events HTML generated, length:', eventsHtml.length)

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

    // Generate Local Scoop section HTML
    const generateLocalScoopSection = (articles: any[]) => {
      if (!articles || articles.length === 0) {
        return ''
      }

      const articlesHtml = articles.map((article: any) => {
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

    // Generate sections in order based on database configuration
    let sectionsHtml = ''
    if (sections && sections.length > 0) {
      for (const section of sections) {
        if (section.name === 'The Local Scoop' && activeArticles.length > 0) {
          sectionsHtml += generateLocalScoopSection(activeArticles)
        } else if (section.name === 'Local Events') {
          sectionsHtml += eventsHtml
        } else if (section.name === 'Local Weather') {
          const weatherHtml = await getWeatherForCampaign(campaign.id)
          if (weatherHtml) {
            sectionsHtml += weatherHtml
          }
        } else if (section.name === "Yesterday's Wordle") {
          const wordleHtml = await this.generateWordleSection(campaign)
          if (wordleHtml) {
            sectionsHtml += wordleHtml
          }
        } else if (section.name === 'Minnesota Getaways') {
          const getawaysHtml = await this.generateMinnesotaGetawaysSection(campaign)
          if (getawaysHtml) {
            sectionsHtml += getawaysHtml
          }
        } else if (section.name === 'Dining Deals') {
          const diningHtml = await this.generateDiningDealsSection(campaign)
          if (diningHtml) {
            sectionsHtml += diningHtml
          }
        }
      }
    } else {
      // Fallback to default order if no sections configured
      console.log('MailerLite - No sections found, using default order')
      sectionsHtml = generateLocalScoopSection(activeArticles) + eventsHtml
    }

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
${sectionsHtml}
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


  private async getReviewScheduleData(date: string): Promise<any> {
    try {
      // Get scheduled send time from database settings
      const { data: setting } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'email_scheduledSendTime')
        .single()

      const scheduledTime = setting?.value || '21:00' // Default to 9:00 PM if not found
      console.log('Using scheduled send time from settings:', scheduledTime)

      // Parse the time (format: "HH:MM")
      const [hours, minutes] = scheduledTime.split(':')

      // MailerLite scheduling format
      const scheduleData = {
        delivery: 'scheduled',
        schedule: {
          date: date, // YYYY-MM-DD format
          hours: hours, // HH format
          minutes: minutes, // MM format
          timezone_id: 157 // Central Time zone ID (based on your Make.com example)
        }
      }

      console.log('MailerLite schedule data:', JSON.stringify(scheduleData, null, 2))
      return scheduleData

    } catch (error) {
      console.error('Error getting review schedule data, using default:', error)
      // Fallback to 9:00 PM CT
      return {
        delivery: 'scheduled',
        schedule: {
          date: date,
          hours: '21',
          minutes: '00',
          timezone_id: 157
        }
      }
    }
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

  private async generateLocalEventsSection(campaign: any): Promise<string> {
    // Calculate 3-day range starting from the newsletter date (campaign.date)
    // Day 1: Newsletter date, Day 2: Next day, Day 3: Day after that
    const newsletterDate = new Date(campaign.date + 'T00:00:00') // Parse as local date

    const dates = []
    for (let i = 0; i <= 2; i++) {
      const date = new Date(newsletterDate)
      date.setDate(newsletterDate.getDate() + i)
      dates.push(date.toISOString().split('T')[0])
    }

    console.log('MailerLite - HTML generation - calculated dates:', dates)

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

    console.log(`MailerLite - HTML generation - found ${availableEvents.length} events for date range ${startDate} to ${endDate}`)

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

    console.log('MailerLite - HTML generation - events by date:', Object.keys(eventsByDate).map(date => `${date}: ${eventsByDate[date].length} events`))

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

  async generateWordleSection(campaign: any): Promise<string> {
    try {
      console.log('MailerLite - Generating Wordle section for campaign:', campaign?.id)

      // Get yesterday's date (since this is for "Yesterday's Wordle")
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayDate = yesterday.toISOString().split('T')[0]

      console.log('MailerLite - Looking for Wordle data for date:', yesterdayDate)

      // Fetch Wordle data for yesterday
      const { data: wordleData, error } = await supabaseAdmin
        .from('wordle')
        .select('*')
        .eq('date', yesterdayDate)
        .single()

      if (error || !wordleData) {
        console.log('MailerLite - No Wordle data found for yesterday:', yesterdayDate)
        return '' // Don't include section if no data
      }

      console.log('MailerLite - Found Wordle data:', wordleData.word)

      // Generate the HTML using the template structure
      const wordleCard = `<table width='100%' cellpadding='0' cellspacing='0' style='border: 1px solid #ddd; border-radius: 12px; background-color: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.15); font-family: Arial, sans-serif; font-size: 16px; color: #333; line-height: 26px;'>
        <tr><td style='background-color: #F8F9FA; text-align: center; padding: 8px; font-weight: bold; font-size: 24px; color: #3C4043; text-transform: uppercase;'>${wordleData.word}</td></tr>
        <tr><td style='padding: 16px;'>
          <div style='margin-bottom: 12px;'><strong>Definition:</strong> ${wordleData.definition}</div>
          <div><strong>Fun Fact:</strong> ${wordleData.interesting_fact}</div>
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
      console.error('MailerLite - Error generating Wordle section:', error)
      return '' // Return empty string on error to not break the newsletter
    }
  }

  async generateMinnesotaGetawaysSection(campaign: any): Promise<string> {
    try {
      console.log('MailerLite - Generating Minnesota Getaways section for campaign:', campaign?.id)

      // Get selected properties for this campaign (or select them if not done yet)
      let selectedProperties = await getSelectedPropertiesForCampaign(campaign.id)

      if (selectedProperties.length === 0) {
        console.log('MailerLite - No existing selections, selecting properties for campaign')
        await selectPropertiesForCampaign(campaign.id)
        selectedProperties = await getSelectedPropertiesForCampaign(campaign.id)
      }

      if (selectedProperties.length === 0) {
        console.log('MailerLite - No VRBO properties available for Minnesota Getaways section')
        return '' // Don't include section if no properties
      }

      console.log(`MailerLite - Found ${selectedProperties.length} selected properties for Minnesota Getaways`)

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
          console.log(`MailerLite - Skipping property ${index + 1} - missing title or link`)
          return
        }

        propertyCards += `
    <!-- CARD ${index + 1} -->
    <td class='column' style='padding:8px; vertical-align: top;'>
      <table cellpadding='0' cellspacing='0' style='width:100%; border: 1px solid #ddd; border-radius: 12px; background-color: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.15);'>
        <tr><td style='padding:0; border-radius: 12px 12px 0 0; overflow: hidden;'>
          ${imageUrl ? `<a href='${link}' target='_blank'><img src='${imageUrl}' alt='${title}' style='width: 100%; height: 200px; object-fit: cover; display: block; border-radius: 12px 12px 0 0;'></a>` : ''}
        </td></tr>
        <tr><td style='padding: 16px; font-family: Arial, sans-serif; font-size: 16px; color: #333; line-height: 26px;'>
          <a href='${link}' target='_blank' style='text-decoration: none; color: inherit;'>
            <h3 style='margin: 0 0 8px; font-size: 18px; font-weight: bold; color: #1a73e8;'>${title}</h3>
            <p style='margin: 0 0 8px; color: #666; font-size: 14px;'>${city}</p>
            <div style='margin-bottom: 12px; font-size: 14px; color: #333;'>
              ${bedrooms}BR | ${bathrooms}BA | Sleeps ${sleeps}
            </div>
          </a>
        </td></tr>
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
<style>
.etsy-col{display:inline-block !important; width:25% !important; max-width:25% !important; vertical-align:top !important;}
.etsy-pad{padding:8px !important;}
}
</style>
<!-- ===== /Minnesota Vrbo ===== -->
<br>`

    } catch (error) {
      console.error('MailerLite - Error generating Minnesota Getaways section:', error)
      return '' // Return empty string on error to not break the newsletter
    }
  }

  async generateDiningDealsSection(campaign: any): Promise<string> {
    try {
      console.log('MailerLite - Generating Dining Deals section for campaign:', campaign.id)

      // Get campaign date to determine day of week
      const campaignDate = new Date(campaign.date + 'T00:00:00')
      const dayOfWeek = campaignDate.toLocaleDateString('en-US', { weekday: 'long' })

      console.log('MailerLite - Campaign date:', campaign.date, 'Day of week:', dayOfWeek)

      // Select or get existing dining deals for this campaign
      const result = await selectDiningDealsForCampaign(campaign.id, campaignDate)
      console.log('MailerLite - Dining deals selection result:', result.message)

      if (!result.deals || result.deals.length === 0) {
        console.log('MailerLite - No dining deals found for', dayOfWeek)
        return ''
      }

      // Format the campaign date for display
      const formattedDate = campaignDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      })

      console.log('MailerLite - Generating HTML for', result.deals.length, 'dining deals')

      // Generate deals HTML - EXACT SAME FORMAT AS PREVIEW
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

      // Wrap in card format - EXACT SAME AS PREVIEW
      const cardHtml = `
        <table width='100%' cellpadding='0' cellspacing='0' style='table-layout: fixed; border: 1px solid #ddd; border-radius: 8px; background: #fff; font-family: Arial, sans-serif; font-size: 16px; line-height: 20px; box-shadow: 0 4px 12px rgba(0,0,0,.15);'>
          <tr><td style='background: #F8F9FA; padding: 8px; text-align: center; font-size: 16px; font-weight: normal; color: #3C4043; border-top-left-radius: 8px; border-top-right-radius: 8px;'>${formattedDate}</td></tr>
          ${dealsHtml}
        </table>`

      // Wrap in section format - EXACT SAME AS PREVIEW
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

      console.log('MailerLite - Generated Dining Deals HTML, length:', sectionHtml.length)
      return sectionHtml

    } catch (error) {
      console.error('MailerLite - Error generating Dining Deals section:', error)
      return ''
    }
  }
}