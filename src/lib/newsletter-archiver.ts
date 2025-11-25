import { supabaseAdmin } from './supabase'
import type { ArchivedNewsletter } from '@/types/database'

interface ArchiveNewsletterParams {
  campaignId: string
  campaignDate: string  // YYYY-MM-DD format
  subjectLine: string
  recipientCount: number
  htmlContent?: string  // Optional HTML backup
}

/**
 * Newsletter Archiver Service
 * Handles archiving sent newsletters for public website display
 */
export class NewsletterArchiver {
  /**
   * Archive a newsletter at send time
   * Captures all structured data for web rendering
   */
  async archiveNewsletter(params: ArchiveNewsletterParams): Promise<{ success: boolean; error?: string; id?: string }> {
    try {
      const { campaignId, campaignDate, subjectLine, recipientCount, htmlContent } = params

      console.log(`[ARCHIVE] Archiving newsletter for campaign ${campaignId} (${campaignDate})...`)

      // 1. Verify campaign exists (we don't need to fetch data, just verify it exists)
      const { error: campaignError } = await supabaseAdmin
        .from('newsletter_campaigns')
        .select('id')
        .eq('id', campaignId)
        .single()

      if (campaignError) {
        console.error('[ARCHIVE] Error fetching campaign:', campaignError)
        return { success: false, error: `Failed to fetch campaign: ${campaignError.message}` }
      }

      // 2. Fetch all active articles for this campaign
      const { data: articles, error: articlesError } = await supabaseAdmin
        .from('articles')
        .select(`
          id,
          headline,
          content,
          word_count,
          rank,
          final_position,
          created_at,
          post_id
        `)
        .eq('campaign_id', campaignId)
        .eq('is_active', true)
        .eq('skipped', false)
        .order('rank', { ascending: true })

      if (articlesError) {
        console.error('[ARCHIVE] Error fetching articles:', articlesError)
        return { success: false, error: `Failed to fetch articles: ${articlesError.message}` }
      }

      console.log(`[ARCHIVE] Found ${articles?.length || 0} articles`)

      // 2b. Fetch RSS posts separately for this campaign
      const { data: rssPosts, error: rssError } = await supabaseAdmin
        .from('rss_posts')
        .select('id, title, source_url, image_url, publication_date')
        .eq('campaign_id', campaignId)

      if (rssError) {
        console.error('[ARCHIVE] Error fetching RSS posts:', rssError)
      }

      // Create a map of RSS posts by ID for quick lookup
      const rssPostMap = new Map()
      rssPosts?.forEach((post: any) => {
        rssPostMap.set(post.id, post)
      })

      // Transform articles and attach RSS post data
      const transformedArticles = articles?.map((article: any) => {
        const rssPostData = article.post_id ? rssPostMap.get(article.post_id) : null

        return {
          id: article.id,
          headline: article.headline,
          content: article.content,
          word_count: article.word_count,
          rank: article.rank,
          final_position: article.final_position,
          image_url: rssPostData?.image_url, // Direct access to image
          rss_post: rssPostData ? {
              title: rssPostData.title,
              source_url: rssPostData.source_url,
              image_url: rssPostData.image_url,
              publication_date: rssPostData.publication_date
            } : undefined
        }
      }) || []

      // 3. Fetch events for this campaign
      const { data: campaignEvents, error: eventsError } = await supabaseAdmin
        .from('campaign_events')
        .select(`
          event_id,
          is_featured,
          event:events(
            id,
            title,
            description,
            event_summary,
            start_date,
            end_date,
            venue,
            address,
            url,
            image_url,
            cropped_image_url,
            featured,
            paid_placement
          )
        `)
        .eq('campaign_id', campaignId)
        .order('event_date', { ascending: true })

      if (eventsError) {
        console.error('[ARCHIVE] Error fetching events:', eventsError)
      }

      // Extract event data with is_featured flag from campaign_events
      const events = campaignEvents?.map((ce: any) => ({
        ...(ce.event || {}),
        featured: ce.is_featured || ce.event?.featured || false
      })) || []

      console.log(`[ARCHIVE] Found ${events.length} events`)

      // 4. Fetch Wordle data (yesterday's date)
      const newsletterDate = new Date(campaignDate + 'T00:00:00')
      const yesterday = new Date(newsletterDate)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayDate = yesterday.toISOString().split('T')[0]

      const { data: wordleData } = await supabaseAdmin
        .from('wordle')
        .select('word, definition, interesting_fact, date')
        .eq('date', yesterdayDate)
        .single()

      // 5. Fetch Poll data (polls are global, not campaign-specific - get the active one)
      // Note: This captures the poll that was active at archive time
      const { data: pollData, error: pollError } = await supabaseAdmin
        .from('polls')
        .select('id, title, question, options, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (pollError && pollError.code !== 'PGRST116') {
        console.error('[ARCHIVE] Error fetching poll:', pollError)
      }
      console.log(`[ARCHIVE] Poll found: ${!!pollData}`)

      // 6. Fetch VRBO/Getaway properties
      const { data: vrboSelections, error: vrboError } = await supabaseAdmin
        .from('campaign_vrbo_selections')
        .select(`
          selection_order,
          listing:vrbo_listings(
            id, title, city, bedrooms, bathrooms, sleeps,
            main_image_url, adjusted_image_url, link, listing_type
          )
        `)
        .eq('campaign_id', campaignId)
        .order('selection_order', { ascending: true })

      if (vrboError) {
        console.error('[ARCHIVE] Error fetching VRBO selections:', vrboError)
      }

      const vrboProperties = vrboSelections?.map((s: any) => s.listing).filter(Boolean) || []
      console.log(`[ARCHIVE] Found ${vrboProperties.length} VRBO properties`)

      // 7. Fetch Dining Deals
      const { data: diningSelections, error: diningError } = await supabaseAdmin
        .from('campaign_dining_selections')
        .select(`
          deal:dining_deals(
            id, business_name, business_address, google_profile,
            special_description, special_time, day_of_week
          )
        `)
        .eq('campaign_id', campaignId)

      if (diningError) {
        console.error('[ARCHIVE] Error fetching dining selections:', diningError)
      }

      const diningDeals = diningSelections?.map((s: any) => s.deal).filter(Boolean) || []
      console.log(`[ARCHIVE] Found ${diningDeals.length} dining deals`)

      // 8. Fetch Weather data (keyed by forecast_date, not campaign_id)
      const { data: weatherData, error: weatherError } = await supabaseAdmin
        .from('weather_forecasts')
        .select('html_content, forecast_date, weather_data, image_url')
        .eq('forecast_date', campaignDate)
        .eq('is_active', true)
        .single()

      if (weatherError && weatherError.code !== 'PGRST116') {
        console.error('[ARCHIVE] Error fetching weather:', weatherError)
      }
      console.log(`[ARCHIVE] Weather data found: ${!!weatherData}`)

      // 9. Fetch Road Work items (stored directly in road_work_items with campaign_id)
      const { data: roadWorkItems, error: roadWorkError } = await supabaseAdmin
        .from('road_work_items')
        .select('id, road_name, road_range, city_or_township, reason, start_date, expected_reopen, source_url, display_order')
        .eq('campaign_id', campaignId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (roadWorkError) {
        console.error('[ARCHIVE] Error fetching road work items:', roadWorkError)
      }
      console.log(`[ARCHIVE] Found ${roadWorkItems?.length || 0} road work items`)

      // 10. Fetch Advertisements
      const { data: adSelections, error: adError } = await supabaseAdmin
        .from('campaign_advertisements')
        .select('advertisement_id, display_order')
        .eq('campaign_id', campaignId)
        .order('display_order', { ascending: true })

      if (adError) {
        console.error('[ARCHIVE] Error fetching advertisement selections:', adError)
      }

      // Fetch advertisements separately
      const adIds = adSelections?.map((s: any) => s.advertisement_id).filter(Boolean) || []
      let advertisements: any[] = []

      if (adIds.length > 0) {
        const { data: ads } = await supabaseAdmin
          .from('advertisements')
          .select('id, business_name, ad_content, image_url, link_url, placement_type, display_order')
          .in('id', adIds)

        advertisements = ads || []
      }

      // 11. Fetch Business Spotlight
      const { data: spotlightData, error: spotlightError } = await supabaseAdmin
        .from('business_spotlights')
        .select(`
          id, business_name, description, image_url, website_url,
          contact_email, contact_phone, address, campaign_id
        `)
        .eq('campaign_id', campaignId)
        .eq('is_active', true)
        .single()

      if (spotlightError && spotlightError.code !== 'PGRST116') {
        console.error('[ARCHIVE] Error fetching business spotlight:', spotlightError)
      }
      console.log(`[ARCHIVE] Business spotlight found: ${!!spotlightData}`)

      // 12. Build sections object
      const sections: any = {}

      if (wordleData) {
        sections.wordle = wordleData
      }

      if (pollData) {
        sections.poll = pollData
      }

      if (vrboProperties.length > 0) {
        sections.minnesota_getaways = { properties: vrboProperties }
      }

      if (diningDeals.length > 0) {
        sections.dining_deals = { deals: diningDeals }
      }

      if (weatherData) {
        sections.weather = {
          html: weatherData.html_content,
          forecast_date: weatherData.forecast_date,
          weather_data: weatherData.weather_data,
          image_url: weatherData.image_url
        }
      }

      if (roadWorkItems && roadWorkItems.length > 0) {
        sections.road_work = {
          items: roadWorkItems
        }
      }

      if (advertisements.length > 0) {
        sections.advertisements = { ads: advertisements }
      }

      if (spotlightData) {
        sections.business_spotlight = spotlightData
      }

      // 13. Gather metadata
      const metadata = {
        total_articles: transformedArticles.length,
        total_events: events.length,
        has_wordle: !!wordleData,
        has_poll: !!pollData,
        has_getaways: vrboProperties.length > 0,
        has_dining_deals: diningDeals.length > 0,
        has_weather: !!weatherData,
        has_road_work: (roadWorkItems?.length || 0) > 0,
        has_advertisements: advertisements.length > 0,
        has_business_spotlight: !!spotlightData,
        archived_at: new Date().toISOString()
      }

      // 14. Create archive record
      const archiveData: Partial<ArchivedNewsletter> = {
        campaign_id: campaignId,
        newsletter_id: 'stcscoop', // Default newsletter ID
        campaign_date: campaignDate,
        subject_line: subjectLine,
        send_date: new Date().toISOString(),
        recipient_count: recipientCount,
        html_backup: htmlContent || null,
        metadata,
        articles: transformedArticles,
        events: events,
        sections
      }

      const { data: insertedArchive, error: insertError } = await supabaseAdmin
        .from('archived_newsletters')
        .insert(archiveData)
        .select('id')
        .single()

      if (insertError) {
        console.error('[ARCHIVE] Error inserting archive:', insertError)
        return { success: false, error: `Failed to create archive: ${insertError.message}` }
      }

      console.log(`[ARCHIVE] ✓ Newsletter archived successfully: ${campaignDate} (ID: ${insertedArchive.id})`)
      return { success: true, id: insertedArchive.id }

    } catch (error: any) {
      console.error('[ARCHIVE] Error archiving newsletter:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Get archived newsletter by date
   */
  async getArchivedNewsletter(date: string, newsletterId: string = 'stcscoop'): Promise<ArchivedNewsletter | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('archived_newsletters')
        .select('*')
        .eq('campaign_date', date)
        .eq('newsletter_id', newsletterId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          console.log(`[ARCHIVE] No archived newsletter found for date: ${date}`)
          return null
        }
        console.error('[ARCHIVE] Error fetching archived newsletter:', error)
        return null
      }

      return data as ArchivedNewsletter
    } catch (error) {
      console.error('[ARCHIVE] Error getting archived newsletter:', error)
      return null
    }
  }

  /**
   * Get list of all archived newsletters
   */
  async getArchiveList(
    limit = 50,
    newsletterId: string = 'stcscoop'
  ): Promise<Array<Pick<ArchivedNewsletter, 'id' | 'campaign_date' | 'subject_line' | 'send_date' | 'metadata' | 'articles' | 'events'>>> {
    try {
      const { data, error } = await supabaseAdmin
        .from('archived_newsletters')
        .select('id, campaign_date, subject_line, send_date, metadata, articles, events')
        .eq('newsletter_id', newsletterId)
        .order('campaign_date', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('[ARCHIVE] Error fetching archive list:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('[ARCHIVE] Error getting archive list:', error)
      return []
    }
  }

  /**
   * Update archive with additional data (e.g., analytics)
   */
  async updateArchive(campaignId: string, updates: Partial<ArchivedNewsletter>): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabaseAdmin
        .from('archived_newsletters')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('campaign_id', campaignId)

      if (error) {
        console.error('[ARCHIVE] Error updating archive:', error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error: any) {
      console.error('[ARCHIVE] Error updating archive:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Delete archived newsletter by campaign ID
   */
  async deleteArchive(campaignId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabaseAdmin
        .from('archived_newsletters')
        .delete()
        .eq('campaign_id', campaignId)

      if (error) {
        console.error('[ARCHIVE] Error deleting archive:', error)
        return { success: false, error: error.message }
      }

      console.log(`[ARCHIVE] ✓ Archive deleted for campaign: ${campaignId}`)
      return { success: true }
    } catch (error: any) {
      console.error('[ARCHIVE] Error deleting archive:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Check if newsletter is archived
   */
  async isArchived(campaignId: string): Promise<boolean> {
    try {
      const { count, error } = await supabaseAdmin
        .from('archived_newsletters')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)

      if (error) {
        console.error('[ARCHIVE] Error checking archive status:', error)
        return false
      }

      return (count || 0) > 0
    } catch (error) {
      console.error('[ARCHIVE] Error checking archive status:', error)
      return false
    }
  }
}

// Export singleton instance
export const newsletterArchiver = new NewsletterArchiver()
