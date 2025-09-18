import axios from 'axios'
import { supabaseAdmin } from './supabase'
import { ErrorHandler, SlackNotificationService } from './slack'
import type { CampaignWithArticles, Article } from '@/types/database'

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

  async createReviewCampaign(campaign: CampaignWithArticles) {
    try {
      console.log(`Creating review campaign for ${campaign.date}`)

      const emailContent = this.generateEmailHTML(campaign, true)
      const subjectLine = campaign.subject_line || `Newsletter Review - ${new Date(campaign.date).toLocaleDateString()}`

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
          type: 'instant'
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

  async createFinalCampaign(campaign: CampaignWithArticles) {
    try {
      console.log(`Creating final campaign for ${campaign.date}`)

      const emailContent = this.generateEmailHTML(campaign, false)
      const subjectLine = campaign.subject_line || `St. Cloud Scoop - ${new Date(campaign.date).toLocaleDateString()}`

      const campaignData = {
        name: `Newsletter: ${campaign.date}`,
        type: 'regular',
        emails: [{
          subject: `🍦 ${subjectLine}`,
          from_name: 'St. Cloud Scoop',
          from: 'scoop@stcscoop.com',
          content: emailContent,
        }],
        groups: [process.env.MAILERLITE_MAIN_GROUP_ID],
        delivery_schedule: {
          type: 'scheduled',
          delivery: this.getScheduledDeliveryTime(campaign.date)
        }
      }

      const response = await mailerliteClient.post('/campaigns', campaignData)

      if (response.status === 201) {
        const campaignId = response.data.data.id

        // Update campaign status and record metrics
        await supabaseAdmin
          .from('newsletter_campaigns')
          .update({
            status: 'sent',
            final_sent_at: new Date().toISOString()
          })
          .eq('id', campaign.id)

        // Store initial metrics
        await supabaseAdmin
          .from('email_metrics')
          .insert([{
            campaign_id: campaign.id,
            mailerlite_campaign_id: campaignId,
            sent_count: 0,
            delivered_count: 0,
            opened_count: 0,
            clicked_count: 0,
            bounced_count: 0,
            unsubscribed_count: 0,
          }])

        await this.logInfo('Final campaign created and scheduled', {
          campaignId: campaign.id,
          mailerliteCampaignId: campaignId
        })

        return { success: true, campaignId }
      }

      throw new Error('Failed to create final campaign')

    } catch (error) {
      await this.logError('Failed to create final campaign', {
        campaignId: campaign.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
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

  private generateEmailHTML(campaign: CampaignWithArticles, isReview: boolean): string {
    const activeArticles = campaign.articles.filter(article => article.is_active)
    const sortedArticles = activeArticles.sort((a, b) => (a.rank || 999) - (b.rank || 999))

    const reviewHeader = isReview ? `
      <div style="background-color: #FEF3C7; padding: 16px; margin-bottom: 24px; border-radius: 8px; border-left: 4px solid #F59E0B;">
        <h3 style="margin: 0; color: #92400E; font-size: 16px;">📝 Newsletter Review</h3>
        <p style="margin: 8px 0 0 0; color: #92400E; font-size: 14px;">
          This is a preview of tomorrow's newsletter. Please review and make any necessary changes in the dashboard.
        </p>
      </div>
    ` : ''

    const articlesHTML = sortedArticles.map((article, index) => `
      <div style="margin-bottom: 32px; padding-bottom: 24px; ${index < sortedArticles.length - 1 ? 'border-bottom: 1px solid #E5E7EB;' : ''}">
        <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600; color: #1F2937; line-height: 1.3;">
          ${article.headline}
        </h2>
        <p style="margin: 0 0 12px 0; font-size: 16px; line-height: 1.6; color: #374151;">
          ${article.content}
        </p>
        ${article.rss_post?.source_url ? `
          <a href="${article.rss_post.source_url}" style="color: #1877F2; text-decoration: none; font-size: 14px; font-weight: 500;">
            Read more →
          </a>
        ` : ''}
      </div>
    `).join('')

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>St. Cloud Scoop Newsletter</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F9FAFB;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF;">
          <!-- Header -->
          <div style="background-color: #1877F2; color: white; padding: 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 700;">
              St. Cloud Scoop
            </h1>
            <p style="margin: 8px 0 0 0; font-size: 16px; opacity: 0.9;">
              ${new Date(campaign.date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>

          <!-- Content -->
          <div style="padding: 32px 24px;">
            ${reviewHeader}

            ${articlesHTML}

            ${sortedArticles.length === 0 ? `
              <div style="text-align: center; padding: 48px 0; color: #6B7280;">
                <p>No articles selected for this newsletter.</p>
              </div>
            ` : ''}
          </div>

          <!-- Footer -->
          <div style="background-color: #F3F4F6; padding: 24px; text-align: center; color: #6B7280; font-size: 14px;">
            <p style="margin: 0 0 8px 0;">
              St. Cloud Scoop - Your Local News Source
            </p>
            <p style="margin: 0;">
              <a href="{{unsubscribe}}" style="color: #6B7280; text-decoration: underline;">
                Unsubscribe
              </a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  }

  private getScheduledDeliveryTime(date: string): string {
    // Schedule for 4:55 AM CT on the campaign date
    const deliveryDate = new Date(date)
    deliveryDate.setHours(4, 55, 0, 0)

    // Convert to UTC (CT is UTC-6 or UTC-5 depending on DST)
    const utcTime = new Date(deliveryDate.getTime() + (6 * 60 * 60 * 1000))

    return utcTime.toISOString()
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