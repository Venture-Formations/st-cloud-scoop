import Parser from 'rss-parser'
import { supabaseAdmin } from './supabase'
import { AI_PROMPTS, callOpenAI } from './openai'
import { ErrorHandler, SlackNotificationService } from './slack'
import type {
  RssFeed,
  RssPost,
  ContentEvaluation,
  NewsletterContent,
  FactCheckResult
} from '@/types/database'

const parser = new Parser({
  customFields: {
    item: ['media:content', 'enclosure']
  }
})

export class RSSProcessor {
  private errorHandler: ErrorHandler
  private slack: SlackNotificationService

  constructor() {
    this.errorHandler = new ErrorHandler()
    this.slack = new SlackNotificationService()
  }

  async processAllFeeds() {
    console.log('Starting RSS processing for all feeds...')

    try {
      // Get today's campaign or create one
      const campaignId = await this.getOrCreateTodaysCampaign()

      // Get active RSS feeds
      const { data: feeds, error: feedsError } = await supabaseAdmin
        .from('rss_feeds')
        .select('*')
        .eq('active', true)

      if (feedsError) {
        throw new Error(`Failed to fetch feeds: ${feedsError.message}`)
      }

      if (!feeds || feeds.length === 0) {
        await this.logError('No active RSS feeds found')
        return
      }

      // Process each feed
      for (const feed of feeds) {
        try {
          await this.processFeed(feed, campaignId)
        } catch (error) {
          await this.logError(`Failed to process feed ${feed.name}`, {
            feedId: feed.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          })

          // Increment error count
          await supabaseAdmin
            .from('rss_feeds')
            .update({
              processing_errors: feed.processing_errors + 1
            })
            .eq('id', feed.id)
        }
      }

      // Process posts with AI
      await this.processPostsWithAI(campaignId)

      // Update campaign status
      await supabaseAdmin
        .from('newsletter_campaigns')
        .update({ status: 'in_review' })
        .eq('id', campaignId)

      await this.errorHandler.logInfo('RSS processing completed successfully', { campaignId }, 'rss_processor')
      await this.slack.sendRSSProcessingAlert(true, campaignId)

    } catch (error) {
      await this.errorHandler.handleError(error, {
        source: 'rss_processor',
        operation: 'processAllFeeds'
      })
      await this.slack.sendRSSProcessingAlert(false, undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  private async getOrCreateTodaysCampaign(): Promise<string> {
    const today = new Date().toISOString().split('T')[0]

    // Check if campaign exists for today
    const { data: existing } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select('id')
      .eq('date', today)
      .single()

    if (existing) {
      return existing.id
    }

    // Create new campaign
    const { data: newCampaign, error } = await supabaseAdmin
      .from('newsletter_campaigns')
      .insert([{ date: today, status: 'draft' }])
      .select('id')
      .single()

    if (error || !newCampaign) {
      throw new Error('Failed to create campaign')
    }

    return newCampaign.id
  }

  private async processFeed(feed: RssFeed, campaignId: string) {
    console.log(`Processing feed: ${feed.name}`)

    try {
      const rssFeed = await parser.parseURL(feed.url)
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const recentPosts = rssFeed.items.filter(item => {
        if (!item.pubDate) return false
        const pubDate = new Date(item.pubDate)
        return pubDate >= yesterday && pubDate <= now
      })

      console.log(`Found ${recentPosts.length} recent posts from ${feed.name}`)

      for (const item of recentPosts) {
        try {
          // Extract image URL
          let imageUrl = null
          if (item['media:content']) {
            imageUrl = item['media:content'].url
          } else if (item.enclosure && item.enclosure.type?.startsWith('image/')) {
            imageUrl = item.enclosure.url
          }

          // Check if post already exists
          const { data: existingPost } = await supabaseAdmin
            .from('rss_posts')
            .select('id')
            .eq('feed_id', feed.id)
            .eq('external_id', item.guid || item.link || '')
            .single()

          if (existingPost) {
            continue // Skip if already processed
          }

          // Insert new post
          const { data: newPost, error: postError } = await supabaseAdmin
            .from('rss_posts')
            .insert([{
              feed_id: feed.id,
              campaign_id: campaignId,
              external_id: item.guid || item.link || '',
              title: item.title || '',
              description: item.contentSnippet || item.content || '',
              content: item.content || '',
              author: item.creator || (item as any)['dc:creator'] || null,
              publication_date: item.pubDate,
              source_url: item.link,
              image_url: imageUrl,
            }])
            .select('id')
            .single()

          if (postError) {
            console.error('Error inserting post:', postError)
            continue
          }

          console.log(`Inserted post: ${item.title}`)

        } catch (error) {
          console.error(`Error processing item from ${feed.name}:`, error)
        }
      }

      // Update feed last processed time
      await supabaseAdmin
        .from('rss_feeds')
        .update({
          last_processed: now.toISOString(),
          processing_errors: 0 // Reset error count on success
        })
        .eq('id', feed.id)

    } catch (error) {
      console.error(`Error parsing RSS feed ${feed.name}:`, error)
      throw error
    }
  }

  private async processPostsWithAI(campaignId: string) {
    console.log('Starting AI processing of posts...')

    // Get all posts for this campaign
    const { data: posts, error } = await supabaseAdmin
      .from('rss_posts')
      .select('*')
      .eq('campaign_id', campaignId)

    if (error || !posts) {
      throw new Error('Failed to fetch posts for AI processing')
    }

    console.log(`Processing ${posts.length} posts with AI`)

    // Step 1: Evaluate posts
    for (const post of posts) {
      try {
        const evaluation = await this.evaluatePost(post)

        // Store evaluation
        await supabaseAdmin
          .from('post_ratings')
          .insert([{
            post_id: post.id,
            interest_level: evaluation.interest_level,
            local_relevance: evaluation.local_relevance,
            community_impact: evaluation.community_impact,
            ai_reasoning: evaluation.reasoning,
          }])

      } catch (error) {
        console.error(`Error evaluating post ${post.id}:`, error)
      }
    }

    // Step 2: Detect and handle duplicates
    await this.handleDuplicates(posts, campaignId)

    // Step 3: Generate newsletter articles for top posts
    await this.generateNewsletterArticles(campaignId)
  }

  private async evaluatePost(post: RssPost): Promise<ContentEvaluation> {
    const prompt = AI_PROMPTS.contentEvaluator({
      title: post.title,
      description: post.description || '',
      content: post.content || ''
    })

    const result = await callOpenAI(prompt)

    if (!result.interest_level || !result.local_relevance || !result.community_impact) {
      throw new Error('Invalid AI evaluation response')
    }

    return result as ContentEvaluation
  }

  private async handleDuplicates(posts: RssPost[], campaignId: string) {
    if (posts.length < 2) return

    const postSummaries = posts.map(post => ({
      title: post.title,
      description: post.description || ''
    }))

    try {
      const prompt = AI_PROMPTS.topicDeduper(postSummaries)
      const result = await callOpenAI(prompt)

      if (result.groups) {
        for (const group of result.groups) {
          const primaryPost = posts[group.primary_article_index]
          if (!primaryPost) continue

          // Create duplicate group
          const { data: duplicateGroup } = await supabaseAdmin
            .from('duplicate_groups')
            .insert([{
              campaign_id: campaignId,
              primary_post_id: primaryPost.id,
              topic_signature: group.topic_signature
            }])
            .select('id')
            .single()

          if (duplicateGroup) {
            // Add duplicate posts to group
            for (const dupIndex of group.duplicate_indices) {
              const dupPost = posts[dupIndex]
              if (dupPost && dupPost.id !== primaryPost.id) {
                await supabaseAdmin
                  .from('duplicate_posts')
                  .insert([{
                    group_id: duplicateGroup.id,
                    post_id: dupPost.id,
                    similarity_score: 0.8 // Default similarity
                  }])
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error handling duplicates:', error)
    }
  }

  private async generateNewsletterArticles(campaignId: string) {
    // Get top-rated posts that aren't duplicates
    const { data: topPosts } = await supabaseAdmin
      .from('rss_posts')
      .select(`
        *,
        post_ratings(*),
        duplicate_posts(id)
      `)
      .eq('campaign_id', campaignId)
      .is('duplicate_posts.id', null) // Exclude duplicates
      .order('post_ratings.total_score', { ascending: false })
      .limit(12) // Get top 12 for processing

    if (!topPosts) return

    for (const post of topPosts) {
      if (!post.post_ratings?.[0]) continue

      try {
        // Generate newsletter content
        const content = await this.generateNewsletterContent(post)

        // Fact-check the content
        const factCheck = await this.factCheckContent(content.content, post.content || post.description || '')

        if (factCheck.passed) {
          // Create article
          await supabaseAdmin
            .from('articles')
            .insert([{
              post_id: post.id,
              campaign_id: campaignId,
              headline: content.headline,
              content: content.content,
              rank: null, // Will be set by ranking algorithm
              is_active: true,
              fact_check_score: factCheck.score,
              fact_check_details: factCheck.details,
              word_count: content.word_count
            }])
        }

      } catch (error) {
        console.error(`Error generating article for post ${post.id}:`, error)
      }
    }
  }

  private async generateNewsletterContent(post: RssPost): Promise<NewsletterContent> {
    const prompt = AI_PROMPTS.newsletterWriter({
      title: post.title,
      description: post.description || '',
      content: post.content || '',
      source_url: post.source_url || ''
    })

    const result = await callOpenAI(prompt)

    if (!result.headline || !result.content || !result.word_count) {
      throw new Error('Invalid newsletter content response')
    }

    return result as NewsletterContent
  }

  private async factCheckContent(newsletterContent: string, originalContent: string): Promise<FactCheckResult> {
    const prompt = AI_PROMPTS.factChecker(newsletterContent, originalContent)
    const result = await callOpenAI(prompt)

    if (typeof result.score !== 'number' || typeof result.passed !== 'boolean') {
      throw new Error('Invalid fact-check response')
    }

    return result as FactCheckResult
  }

  private async logInfo(message: string, context: Record<string, any> = {}) {
    await supabaseAdmin
      .from('system_logs')
      .insert([{
        level: 'info',
        message,
        context,
        source: 'rss_processor'
      }])
  }

  private async logError(message: string, context: Record<string, any> = {}) {
    await supabaseAdmin
      .from('system_logs')
      .insert([{
        level: 'error',
        message,
        context,
        source: 'rss_processor'
      }])
  }
}