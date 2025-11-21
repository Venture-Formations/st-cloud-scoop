import { supabaseAdmin } from '@/lib/supabase'
import { RSSProcessor } from '@/lib/rss-processor'

/**
 * RSS Processing Workflow for St. Cloud Scoop
 * Each step gets its own 800-second timeout with automatic retry logic
 *
 * WORKFLOW STRUCTURE:
 * Step 1:  Setup (create campaign, archive, clear old data)
 * Step 2:  Fetch RSS posts from all feeds
 * Step 3:  AI evaluation of all posts (batched internally)
 * Step 4:  Populate events for campaign
 * Step 5:  Deduplication + article generation (combined)
 * Step 6:  Select top articles
 * Step 7:  Process images to GitHub
 * Step 8:  Generate subject line
 * Step 9:  Generate road work data
 * Step 10: Finalize (set status to draft)
 */
export async function processRSSWorkflow(input: {
  trigger: 'cron' | 'manual'
  campaign_date: string
}) {
  "use workflow"

  let campaignId: string

  console.log(`[Workflow] Starting RSS processing for date: ${input.campaign_date}`)

  // STEP 1: Setup
  campaignId = await setupCampaign(input.campaign_date)

  // STEP 2: Fetch RSS Posts
  await fetchRSSPosts(campaignId)

  // STEP 3: AI Evaluation
  await evaluatePostsWithAI(campaignId)

  // STEP 4: Populate Events
  await populateEvents(campaignId)

  // STEP 5: Dedupe + Generate Articles
  await deduplicateAndGenerateArticles(campaignId)

  // STEP 6: Select Top Articles
  await selectTopArticles(campaignId)

  // STEP 7: Process Images
  await processImages(campaignId)

  // STEP 8: Generate Subject Line
  await generateSubjectLine(campaignId)

  // STEP 9: Generate Road Work
  await generateRoadWork(campaignId)

  // STEP 10: Finalize
  await finalizeCampaign(campaignId)

  console.log('[Workflow] === WORKFLOW COMPLETE ===')

  return { campaignId, success: true }
}

// ============================================================================
// STEP FUNCTIONS WITH RETRY LOGIC
// ============================================================================

async function setupCampaign(campaignDate: string) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 1/10] Setting up campaign...')

      // Check if campaign exists
      const { data: existing } = await supabaseAdmin
        .from('newsletter_campaigns')
        .select('id')
        .eq('date', campaignDate)
        .single()

      let campaignId: string

      if (existing) {
        campaignId = existing.id
        console.log(`[Workflow Step 1/10] Using existing campaign: ${campaignId}`)
      } else {
        // Create new campaign
        const { data: newCampaign, error } = await supabaseAdmin
          .from('newsletter_campaigns')
          .insert([{ date: campaignDate, status: 'processing' }])
          .select('id')
          .single()

        if (error || !newCampaign) {
          throw new Error('Failed to create campaign')
        }

        campaignId = newCampaign.id
        console.log(`[Workflow Step 1/10] Created new campaign: ${campaignId}`)
      }

      // Archive existing data
      const { ArticleArchiveService } = await import('@/lib/article-archive')
      const archiveService = new ArticleArchiveService()

      try {
        const archiveResult = await archiveService.archiveCampaignArticles(campaignId, 'rss_processing_clear')
        console.log(`[Workflow Step 1/10] Archived ${archiveResult.archivedArticlesCount} articles, ${archiveResult.archivedPostsCount} posts`)
      } catch (archiveError) {
        console.warn('[Workflow Step 1/10] Archive failed (non-critical):', archiveError)
      }

      // Clear previous data
      await supabaseAdmin.from('articles').delete().eq('campaign_id', campaignId)
      await supabaseAdmin.from('rss_posts').delete().eq('campaign_id', campaignId)

      console.log('[Workflow Step 1/10] ✓ Setup complete')
      return campaignId

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 1/10] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 1/10] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  throw new Error('Unexpected: Retry loop exited without return')
}

async function fetchRSSPosts(campaignId: string) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 2/10] Fetching RSS posts...')

      const processor = new RSSProcessor()

      // Get active feeds
      const { data: feeds, error: feedsError } = await supabaseAdmin
        .from('rss_feeds')
        .select('*')
        .eq('active', true)

      if (feedsError || !feeds || feeds.length === 0) {
        throw new Error('No active RSS feeds found')
      }

      console.log(`[Workflow Step 2/10] Processing ${feeds.length} feeds`)

      // Process each feed (uses campaign-specific duplicate detection)
      for (const feed of feeds) {
        try {
          await processor['processFeed'](feed, campaignId)
        } catch (feedError) {
          console.warn(`[Workflow Step 2/10] Feed ${feed.name} failed:`, feedError)
          // Continue with other feeds
        }
      }

      // Count posts fetched
      const { data: posts } = await supabaseAdmin
        .from('rss_posts')
        .select('id')
        .eq('campaign_id', campaignId)

      console.log(`[Workflow Step 2/10] ✓ Fetched ${posts?.length || 0} posts`)
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 2/10] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 2/10] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

async function evaluatePostsWithAI(campaignId: string) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 3/10] Evaluating posts with AI...')

      const processor = new RSSProcessor()

      // This method handles batching internally
      await processor['processPostsWithAI'](campaignId)

      // Count rated posts
      const { data: ratedPosts } = await supabaseAdmin
        .from('rss_posts')
        .select(`
          id,
          post_ratings(total_score)
        `)
        .eq('campaign_id', campaignId)
        .not('post_ratings', 'is', null)

      console.log(`[Workflow Step 3/10] ✓ Evaluated ${ratedPosts?.length || 0} posts with AI`)
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 3/10] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 3/10] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

async function populateEvents(campaignId: string) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 4/10] Populating events...')

      const processor = new RSSProcessor()
      await processor.populateEventsForCampaignSmart(campaignId)

      const { data: events } = await supabaseAdmin
        .from('campaign_events')
        .select('id')
        .eq('campaign_id', campaignId)

      console.log(`[Workflow Step 4/10] ✓ Populated ${events?.length || 0} events`)
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 4/10] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 4/10] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

async function deduplicateAndGenerateArticles(campaignId: string) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 5/10] Deduplicating + generating articles...')

      const processor = new RSSProcessor()

      // Get all posts
      const { data: posts } = await supabaseAdmin
        .from('rss_posts')
        .select('*')
        .eq('campaign_id', campaignId)

      // Deduplicate
      if (posts && posts.length > 1) {
        await processor['handleDuplicates'](posts, campaignId)
      }

      // Generate articles (handles fact-checking internally)
      await processor['generateNewsletterArticles'](campaignId)

      const { data: articles } = await supabaseAdmin
        .from('articles')
        .select('id')
        .eq('campaign_id', campaignId)

      console.log(`[Workflow Step 5/10] ✓ Generated ${articles?.length || 0} articles`)
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 5/10] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 5/10] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

async function selectTopArticles(campaignId: string) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 6/10] Selecting top articles...')

      const processor = new RSSProcessor()
      await processor['selectTop5Articles'](campaignId)

      const { data: activeArticles } = await supabaseAdmin
        .from('articles')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('is_active', true)

      console.log(`[Workflow Step 6/10] ✓ Selected ${activeArticles?.length || 0} active articles`)
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 6/10] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 6/10] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

async function processImages(campaignId: string) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 7/10] Processing images to GitHub...')

      const processor = new RSSProcessor()
      await processor['processArticleImages'](campaignId)

      console.log('[Workflow Step 7/10] ✓ Images processed')
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 7/10] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 7/10] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

async function generateSubjectLine(campaignId: string) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 8/10] Generating subject line...')

      const processor = new RSSProcessor()
      await processor.generateSubjectLineForCampaign(campaignId)

      const { data: campaign } = await supabaseAdmin
        .from('newsletter_campaigns')
        .select('subject_line')
        .eq('id', campaignId)
        .single()

      console.log(`[Workflow Step 8/10] ✓ Subject: "${campaign?.subject_line || 'Not generated'}"`)
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 8/10] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 8/10] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

async function generateRoadWork(campaignId: string) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 9/10] Generating road work data...')

      const { generateDailyRoadWork, storeRoadWorkItems } = await import('@/lib/road-work-manager')

      // Get campaign date
      const { data: campaignData } = await supabaseAdmin
        .from('newsletter_campaigns')
        .select('date')
        .eq('id', campaignId)
        .single()

      if (campaignData) {
        const roadWorkData = await generateDailyRoadWork(campaignData.date)

        if (roadWorkData.road_work_data && roadWorkData.road_work_data.length > 0) {
          await storeRoadWorkItems(roadWorkData.road_work_data, campaignId)
          console.log(`[Workflow Step 9/10] ✓ Generated ${roadWorkData.road_work_data.length} road work items`)
        } else {
          console.log('[Workflow Step 9/10] ⚠️ No road work items generated')
        }
      }

      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 9/10] Failed after ${maxRetries} retries`)
        // Don't throw - road work is non-critical
        console.log('[Workflow Step 9/10] Continuing despite road work failure')
        return
      }
      console.log(`[Workflow Step 9/10] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

async function finalizeCampaign(campaignId: string) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 10/10] Finalizing campaign...')

      // Update campaign status to draft
      await supabaseAdmin
        .from('newsletter_campaigns')
        .update({ status: 'draft' })
        .eq('id', campaignId)

      // Get final counts
      const { data: articles } = await supabaseAdmin
        .from('articles')
        .select('id')
        .eq('campaign_id', campaignId)

      const { data: activeArticles } = await supabaseAdmin
        .from('articles')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('is_active', true)

      console.log(`[Workflow Step 10/10] ✓ Finalized: ${activeArticles?.length || 0} active articles (${articles?.length || 0} total)`)

      // Send Slack notification
      try {
        const { SlackNotificationService } = await import('@/lib/slack')
        const slack = new SlackNotificationService()

        const { data: campaignInfo } = await supabaseAdmin
          .from('newsletter_campaigns')
          .select('date')
          .eq('id', campaignId)
          .single()

        await slack.sendRSSProcessingCompleteAlert(
          campaignId,
          articles?.length || 0,
          campaignInfo?.date || 'Unknown'
        )
      } catch (slackError) {
        console.log('[Workflow Step 10/10] Slack notification failed (non-critical)')
      }

      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 10/10] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 10/10] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}
