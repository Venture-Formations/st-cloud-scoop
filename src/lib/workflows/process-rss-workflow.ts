import { supabaseAdmin } from '@/lib/supabase'
import { RSSProcessor } from '@/lib/rss-processor'

/**
 * RSS Processing Workflow for St. Cloud Scoop
 * Each step gets its own 800-second timeout with automatic retry logic
 *
 * WORKFLOW STRUCTURE:
 * Step 1:  Setup (create campaign with status='processing')
 * Step 2:  Query Top Posts (identify top 20 rated posts from past X hours with campaign_id=NULL)
 * Step 3:  Deduplicate (against sent campaigns from past Y days)
 * Step 4:  Assign Posts (assign non-duplicate posts to campaign)
 * Step 5:  Generate Articles (for top 12 non-duplicate posts)
 * Step 6:  Select Top 5 Articles (for newsletter, others available in UI)
 * Step 7:  Populate Events (auto-select events for campaign)
 * Step 8:  Process Images (upload to GitHub)
 * Step 9:  Generate Subject Line (based on top article)
 * Step 10: Generate Road Work (section data)
 * Step 11: Finalize (unassign unused posts, set status='draft')
 */
export async function processRSSWorkflow(input: {
  trigger: 'cron' | 'manual'
  campaign_date: string
}) {
  "use workflow"

  let campaignId: string
  let topPostIds: string[] = []

  console.log(`[Workflow] Starting newsletter creation for date: ${input.campaign_date}`)

  // STEP 1: Setup Campaign
  campaignId = await setupCampaign(input.campaign_date)

  // STEP 2: Query Top Rated Posts (but don't assign yet)
  topPostIds = await queryTopPosts()

  // STEP 3: Deduplicate Against Sent Campaigns
  topPostIds = await deduplicatePosts(topPostIds)

  // STEP 4: Assign Non-Duplicate Posts to Campaign
  await assignPostsToCampaign(campaignId, topPostIds)

  // STEP 5: Generate Articles for Top 12 Posts
  await generateArticles(campaignId)

  // STEP 6: Select Top 5 Articles
  await selectTopArticles(campaignId)

  // STEP 7: Populate Events
  await populateEvents(campaignId)

  // STEP 8: Process Images
  await processImages(campaignId)

  // STEP 9: Generate Subject Line
  await generateSubjectLine(campaignId)

  // STEP 10: Generate Road Work
  await generateRoadWork(campaignId)

  // STEP 11: Finalize & Cleanup
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

        // Update status to processing
        await supabaseAdmin
          .from('newsletter_campaigns')
          .update({ status: 'processing' })
          .eq('id', campaignId)
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

      console.log('[Workflow Step 1/10] ✓ Campaign ready')
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

async function queryTopPosts(): Promise<string[]> {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 2/11] Querying top rated posts...')

      // Get settings
      const { data: settings } = await supabaseAdmin
        .from('app_settings')
        .select('key, value')
        .in('key', ['email_articleLookbackHours'])

      const lookbackHours = parseInt(settings?.find(s => s.key === 'email_articleLookbackHours')?.value || '24')

      // Calculate lookback timestamp
      const lookbackDate = new Date()
      lookbackDate.setHours(lookbackDate.getHours() - lookbackHours)
      const lookbackTimestamp = lookbackDate.toISOString()

      console.log(`[Workflow Step 2/11] Searching for posts from past ${lookbackHours} hours`)

      // Query top 20 rated posts where campaign_id IS NULL
      const { data: availablePosts, error: postsError } = await supabaseAdmin
        .from('rss_posts')
        .select(`
          id,
          title,
          post_ratings(total_score)
        `)
        .is('campaign_id', null)
        .gte('processed_at', lookbackTimestamp)
        .not('post_ratings', 'is', null)

      if (postsError) {
        throw new Error(`Failed to query posts: ${postsError.message}`)
      }

      if (!availablePosts || availablePosts.length === 0) {
        console.warn('[Workflow Step 2/11] No rated posts available')
        return []
      }

      // Sort by rating and take top 20
      const topPosts = availablePosts
        .filter(post => post.post_ratings?.[0]?.total_score)
        .sort((a, b) => {
          const scoreA = a.post_ratings?.[0]?.total_score || 0
          const scoreB = b.post_ratings?.[0]?.total_score || 0
          return scoreB - scoreA
        })
        .slice(0, 20)

      console.log(`[Workflow Step 2/11] Found ${availablePosts.length} available posts, selecting top 20`)

      const postIds = topPosts.map(p => p.id)
      console.log(`[Workflow Step 2/11] ✓ Identified ${postIds.length} top-rated posts (NOT assigned yet)`)

      return postIds

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 2/11] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 2/11] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  return []
}

async function deduplicatePosts(topPostIds: string[]): Promise<string[]> {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 3/11] Deduplicating against sent campaigns...')

      if (topPostIds.length === 0) {
        console.log('[Workflow Step 3/11] No posts to deduplicate')
        return []
      }

      // Get settings
      const { data: settings } = await supabaseAdmin
        .from('app_settings')
        .select('key, value')
        .in('key', ['email_deduplicationLookbackDays'])

      const lookbackDays = parseInt(settings?.find(s => s.key === 'email_deduplicationLookbackDays')?.value || '3')

      // Calculate lookback date
      const lookbackDate = new Date()
      lookbackDate.setDate(lookbackDate.getDate() - lookbackDays)
      const lookbackDateStr = lookbackDate.toISOString().split('T')[0]

      console.log(`[Workflow Step 3/11] Checking for duplicates against sent campaigns from past ${lookbackDays} days`)

      // Get posts from sent campaigns in the lookback window
      const { data: sentCampaigns } = await supabaseAdmin
        .from('newsletter_campaigns')
        .select('id')
        .eq('status', 'sent')
        .gte('date', lookbackDateStr)

      if (!sentCampaigns || sentCampaigns.length === 0) {
        console.log('[Workflow Step 3/11] No sent campaigns in lookback window - all posts are unique')
        return topPostIds
      }

      const sentCampaignIds = sentCampaigns.map(c => c.id)

      // Get posts used in those sent campaigns
      const { data: usedPosts } = await supabaseAdmin
        .from('rss_posts')
        .select('external_id, title')
        .in('campaign_id', sentCampaignIds)

      if (!usedPosts || usedPosts.length === 0) {
        console.log('[Workflow Step 3/11] No posts in sent campaigns - all posts are unique')
        return topPostIds
      }

      const usedExternalIds = new Set(usedPosts.map(p => p.external_id))

      // Get the candidate posts to check for duplicates
      const { data: candidatePosts } = await supabaseAdmin
        .from('rss_posts')
        .select('id, external_id, title')
        .in('id', topPostIds)

      if (!candidatePosts || candidatePosts.length === 0) {
        console.log('[Workflow Step 3/11] No candidate posts found')
        return []
      }

      // Filter out duplicates
      const nonDuplicatePosts = candidatePosts.filter(post => !usedExternalIds.has(post.external_id))
      const duplicateCount = candidatePosts.length - nonDuplicatePosts.length

      if (duplicateCount > 0) {
        console.log(`[Workflow Step 3/11] ✓ Found ${duplicateCount} duplicates, ${nonDuplicatePosts.length} unique posts remain`)
      } else {
        console.log('[Workflow Step 3/11] ✓ No duplicates found, all posts are unique')
      }

      return nonDuplicatePosts.map(p => p.id)

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 3/11] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 3/11] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  return []
}

async function assignPostsToCampaign(campaignId: string, postIds: string[]) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 4/11] Assigning non-duplicate posts to campaign...')

      if (postIds.length === 0) {
        console.warn('[Workflow Step 4/11] No posts to assign')
        return
      }

      // Assign these posts to this campaign
      const { error: assignError } = await supabaseAdmin
        .from('rss_posts')
        .update({ campaign_id: campaignId })
        .in('id', postIds)

      if (assignError) {
        throw new Error(`Failed to assign posts: ${assignError.message}`)
      }

      console.log(`[Workflow Step 4/11] ✓ Assigned ${postIds.length} non-duplicate posts to campaign`)
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 4/11] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 4/11] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

async function generateArticles(campaignId: string) {
  "use step"

  let retryCount = 0
  const maxRetries = 2

  while (retryCount <= maxRetries) {
    try {
      console.log('[Workflow Step 5/11] Generating articles for top 12 posts...')

      const processor = new RSSProcessor()

      // Generate articles (handles fact-checking internally)
      // generateNewsletterArticles will create articles for ALL remaining posts
      await processor['generateNewsletterArticles'](campaignId)

      const { data: articles } = await supabaseAdmin
        .from('articles')
        .select('id')
        .eq('campaign_id', campaignId)

      console.log(`[Workflow Step 5/11] ✓ Generated ${articles?.length || 0} articles`)
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 5/11] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 5/11] Error occurred, retrying (${retryCount}/${maxRetries})...`)
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
      console.log('[Workflow Step 6/11] Selecting top 5 articles...')

      const processor = new RSSProcessor()
      await processor['selectTop5Articles'](campaignId)

      const { data: activeArticles } = await supabaseAdmin
        .from('articles')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('is_active', true)

      console.log(`[Workflow Step 6/11] ✓ Selected ${activeArticles?.length || 0} active articles`)
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 6/11] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 6/11] Error occurred, retrying (${retryCount}/${maxRetries})...`)
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
      console.log('[Workflow Step 7/11] Populating events...')

      const processor = new RSSProcessor()
      await processor.populateEventsForCampaignSmart(campaignId)

      const { data: events } = await supabaseAdmin
        .from('campaign_events')
        .select('id')
        .eq('campaign_id', campaignId)

      console.log(`[Workflow Step 7/11] ✓ Populated ${events?.length || 0} events`)
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 7/11] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 7/11] Error occurred, retrying (${retryCount}/${maxRetries})...`)
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
      console.log('[Workflow Step 8/11] Processing images to GitHub...')

      const processor = new RSSProcessor()
      await processor['processArticleImages'](campaignId)

      console.log('[Workflow Step 8/11] ✓ Images processed')
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 8/11] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 8/11] Error occurred, retrying (${retryCount}/${maxRetries})...`)
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
      console.log('[Workflow Step 9/11] Generating subject line...')

      const processor = new RSSProcessor()
      await processor.generateSubjectLineForCampaign(campaignId)

      const { data: campaign } = await supabaseAdmin
        .from('newsletter_campaigns')
        .select('subject_line')
        .eq('id', campaignId)
        .single()

      console.log(`[Workflow Step 9/11] ✓ Subject: "${campaign?.subject_line || 'Not generated'}"`)
      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 9/11] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 9/11] Error occurred, retrying (${retryCount}/${maxRetries})...`)
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
      console.log('[Workflow Step 10/11] Generating road work data...')

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
          console.log(`[Workflow Step 10/11] ✓ Generated ${roadWorkData.road_work_data.length} road work items`)
        } else {
          console.log('[Workflow Step 10/11] ⚠️ No road work items generated')
        }
      }

      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 10/11] Failed after ${maxRetries} retries`)
        // Don't throw - road work is non-critical
        console.log('[Workflow Step 10/11] Continuing despite road work failure')
        return
      }
      console.log(`[Workflow Step 10/11] Error occurred, retrying (${retryCount}/${maxRetries})...`)
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
      console.log('[Workflow Step 11/11] Finalizing campaign...')

      // Unassign unused posts (posts that didn't get articles created)
      const { data: allPosts } = await supabaseAdmin
        .from('rss_posts')
        .select('id')
        .eq('campaign_id', campaignId)

      const { data: articles } = await supabaseAdmin
        .from('articles')
        .select('post_id')
        .eq('campaign_id', campaignId)

      if (allPosts && articles) {
        const usedPostIds = new Set(articles.map(a => a.post_id))
        const unusedPostIds = allPosts
          .filter(post => !usedPostIds.has(post.id))
          .map(post => post.id)

        if (unusedPostIds.length > 0) {
          console.log(`[Workflow Step 11/11] Unassigning ${unusedPostIds.length} unused posts`)
          await supabaseAdmin
            .from('rss_posts')
            .update({ campaign_id: null })
            .in('id', unusedPostIds)
        }
      }

      // Update campaign status to draft
      await supabaseAdmin
        .from('newsletter_campaigns')
        .update({ status: 'draft' })
        .eq('id', campaignId)

      // Get final counts
      const { data: finalArticles } = await supabaseAdmin
        .from('articles')
        .select('id')
        .eq('campaign_id', campaignId)

      const { data: activeArticles } = await supabaseAdmin
        .from('articles')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('is_active', true)

      console.log(`[Workflow Step 11/11] ✓ Finalized: ${activeArticles?.length || 0} active articles (${finalArticles?.length || 0} total)`)

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
        console.log('[Workflow Step 11/11] Slack notification failed (non-critical)')
      }

      return

    } catch (error) {
      retryCount++
      if (retryCount > maxRetries) {
        console.error(`[Workflow Step 11/11] Failed after ${maxRetries} retries`)
        throw error
      }
      console.log(`[Workflow Step 11/11] Error occurred, retrying (${retryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}
