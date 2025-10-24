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

      // 1. Fetch campaign data
      const { data: campaign, error: campaignError } = await supabaseAdmin
        .from('newsletter_campaigns')
        .select('newsletter_id')
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
          rss_post:rss_posts(
            title,
            source_url,
            image_url,
            publication_date
          )
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

      // Transform articles to match interface (rss_post is array from DB, but we want single object)
      const transformedArticles = articles?.map((article: any) => ({
        id: article.id,
        headline: article.headline,
        content: article.content,
        word_count: article.word_count,
        rank: article.rank,
        final_position: article.final_position,
        rss_post: Array.isArray(article.rss_post) && article.rss_post.length > 0
          ? {
              title: article.rss_post[0].title,
              source_url: article.rss_post[0].source_url,
              image_url: article.rss_post[0].image_url,
              publication_date: article.rss_post[0].publication_date
            }
          : undefined
      })) || []

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

      // 4. Fetch road work data
      const { data: roadWorkData, error: roadWorkError } = await supabaseAdmin
        .from('road_work_data')
        .select('road_work_data, generated_at')
        .eq('campaign_id', campaignId)
        .eq('is_active', true)
        .single()

      if (roadWorkError && roadWorkError.code !== 'PGRST116') {
        console.error('[ARCHIVE] Error fetching road work:', roadWorkError)
      }

      // 5. Build sections object
      const sections: any = {}

      // Road Work section
      if (roadWorkData && roadWorkData.road_work_data) {
        sections.road_work = {
          items: roadWorkData.road_work_data,
          generated_at: roadWorkData.generated_at
        }
      }

      // 6. Gather metadata
      const metadata = {
        total_articles: transformedArticles.length,
        total_events: events.length,
        has_road_work: !!roadWorkData,
        archived_at: new Date().toISOString()
      }

      // 7. Create archive record
      const archiveData: Partial<ArchivedNewsletter> = {
        campaign_id: campaignId,
        newsletter_id: campaign.newsletter_id || 'stcscoop',
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
