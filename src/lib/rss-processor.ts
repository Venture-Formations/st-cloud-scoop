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
      await this.processAllFeedsForCampaign(campaignId)
    } catch (error) {
      await this.errorHandler.handleError(error, {
        source: 'rss_processor',
        operation: 'processAllFeeds'
      })
      await this.slack.sendRSSProcessingAlert(false, undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  async processAllFeedsForCampaign(campaignId: string) {
    console.log(`Starting RSS processing for campaign: ${campaignId}`)

    try {
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
        operation: 'processAllFeedsForCampaign'
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

    // Step 1: Evaluate posts in batches
    const BATCH_SIZE = 3 // Process 3 posts at a time
    let successCount = 0
    let errorCount = 0

    // Split posts into batches
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(posts.length / BATCH_SIZE)

      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} posts)`)

      // Process batch concurrently
      const batchPromises = batch.map(async (post, index) => {
        try {
          const overallIndex = i + index + 1
          console.log(`Evaluating post ${overallIndex}/${posts.length}: ${post.title}`)

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

          console.log(`Successfully evaluated post ${overallIndex}/${posts.length}`)
          return { success: true, post: post }

        } catch (error) {
          console.error(`Error evaluating post ${post.id}:`, error)

          // Log error to database
          await this.logError(`Failed to evaluate post: ${post.title}`, {
            postId: post.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          })

          return { success: false, post: post, error }
        }
      })

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises)

      // Count results
      const batchSuccess = batchResults.filter(r => r.success).length
      const batchErrors = batchResults.filter(r => !r.success).length

      successCount += batchSuccess
      errorCount += batchErrors

      console.log(`Batch ${batchNum} complete: ${batchSuccess} successful, ${batchErrors} errors`)

      // Add delay between batches to respect rate limits
      if (i + BATCH_SIZE < posts.length) {
        console.log('Waiting 2 seconds before next batch...')
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    console.log(`AI evaluation complete: ${successCount} successful, ${errorCount} errors`)
    await this.logInfo(`AI evaluation complete: ${successCount} successful, ${errorCount} errors`, { campaignId, successCount, errorCount })

    // Step 2: Detect and handle duplicates
    await this.handleDuplicates(posts, campaignId)

    // Step 3: Generate newsletter articles for top posts
    await this.logInfo('Starting newsletter article generation...', { campaignId })
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
    console.log('Starting newsletter article generation...')

    // Get top-rated posts that aren't duplicates
    const { data: topPosts, error: queryError } = await supabaseAdmin
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

    if (queryError) {
      console.error('Error fetching top posts:', queryError)
      return
    }

    if (!topPosts || topPosts.length === 0) {
      console.log('No top posts found for article generation')
      return
    }

    console.log(`Found ${topPosts.length} top posts for article generation`)
    await this.logInfo(`Found ${topPosts.length} top posts for article generation`, { campaignId, topPostsCount: topPosts.length })

    const postsWithRatings = topPosts.filter(post => post.post_ratings?.[0])
    console.log(`${postsWithRatings.length} posts have ratings`)
    await this.logInfo(`${postsWithRatings.length} posts have ratings`, { campaignId, postsWithRatings: postsWithRatings.length })

    if (postsWithRatings.length === 0) {
      console.log('No posts with ratings found - checking all posts with ratings')

      // Try a simpler query to get posts with ratings
      const { data: allRatedPosts } = await supabaseAdmin
        .from('rss_posts')
        .select(`
          *,
          post_ratings(*)
        `)
        .eq('campaign_id', campaignId)
        .not('post_ratings', 'is', null)

      console.log(`Alternative query found ${allRatedPosts?.length || 0} posts with ratings`)
      await this.logInfo(`Alternative query found ${allRatedPosts?.length || 0} posts with ratings`, { campaignId, alternativePostsCount: allRatedPosts?.length || 0 })

      if (allRatedPosts && allRatedPosts.length > 0) {
        // Use these posts instead
        for (const post of allRatedPosts.slice(0, 12)) {
          await this.processPostIntoArticle(post, campaignId)
        }
      }
      return
    }

    for (const post of postsWithRatings) {
      await this.processPostIntoArticle(post, campaignId)
    }

    console.log('Newsletter article generation complete')
  }

  private async processPostIntoArticle(post: any, campaignId: string) {
    try {
      console.log(`Generating article for: ${post.title}`)

      // Generate newsletter content
      const content = await this.generateNewsletterContent(post)

      // Fact-check the content
      const factCheck = await this.factCheckContent(content.content, post.content || post.description || '')

      console.log(`Fact-check result for "${post.title}": ${factCheck.passed ? 'PASSED' : 'FAILED'} (score: ${factCheck.score})`)

      if (factCheck.passed) {
        // Create article
        const { data, error } = await supabaseAdmin
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

        if (error) {
          console.error(`Error inserting article for post ${post.id}:`, error)
        } else {
          console.log(`Successfully created article: "${content.headline}"`)
          await this.logInfo(`Successfully created article: "${content.headline}"`, { campaignId, postId: post.id })
        }
      } else {
        console.log(`Article rejected due to fact-check failure: "${post.title}"`)
      }

    } catch (error) {
      console.error(`Error generating article for post ${post.id}:`, error)
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