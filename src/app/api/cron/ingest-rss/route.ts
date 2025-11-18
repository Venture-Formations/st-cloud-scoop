import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { callAIWithPrompt } from '@/lib/openai'
import { GitHubImageStorage } from '@/lib/github-storage'

/**
 * RSS Ingestion Cron
 * Runs every hour to:
 * 1. Fetch new RSS posts
 * 2. Score them with multi-criteria AI
 * 3. Store posts and ratings
 *
 * Schedule: 0 * * * * (every hour)
 * Timeout: 300 seconds (5 minutes)
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check (Vercel cron or manual with secret)
    const searchParams = new URL(request.url).searchParams
    const secret = searchParams.get('secret')

    const isVercelCron = !secret && !searchParams.has('secret')
    const isManualTest = secret === process.env.CRON_SECRET

    if (!isVercelCron && !isManualTest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[RSS Ingest] Starting hourly RSS ingestion for St. Cloud Scoop')

    // Initialize GitHub storage for image re-hosting
    const githubStorage = new GitHubImageStorage()

    // Get all active RSS feeds
    const { data: feeds, error: feedsError } = await supabaseAdmin
      .from('rss_feeds')
      .select('*')
      .eq('active', true)

    if (feedsError || !feeds || feeds.length === 0) {
      console.log('[RSS Ingest] No active feeds found')
      return NextResponse.json({
        success: true,
        message: 'No active feeds',
        processed: 0
      })
    }

    console.log(`[RSS Ingest] Processing ${feeds.length} RSS feeds`)

    let totalFetched = 0
    let totalNewPosts = 0
    let feedResults: Array<{name: string, fetched: number, new: number, error?: string}> = []

    // Process each feed
    for (const feed of feeds) {
      try {
        console.log(`[RSS Ingest] Fetching feed: ${feed.name} (${feed.url})`)

        // Fetch RSS feed using native fetch
        const response = await fetch(feed.url, {
          headers: {
            'User-Agent': 'St. Cloud Scoop RSS Reader/1.0'
          }
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const xmlText = await response.text()

        // Parse XML (simple regex-based parsing for RSS/Atom)
        const items = extractRSSItems(xmlText)

        console.log(`[RSS Ingest] Found ${items.length} items in ${feed.name}`)

        let newPostsCount = 0

        // Save each item to database
        for (const item of items) {
          try {
            // Check if post already exists (by title + source_url)
            const { data: existingPost } = await supabaseAdmin
              .from('rss_posts')
              .select('id')
              .eq('feed_id', feed.id)
              .eq('title', item.title)
              .eq('source_url', item.link)
              .maybeSingle()

            if (existingPost) {
              // Post already exists, skip
              console.log(`[RSS Ingest] Skipping duplicate post: ${item.title.substring(0, 50)}`)
              continue
            }

            // Re-host image to GitHub if imageUrl exists
            let finalImageUrl = item.imageUrl || null
            if (finalImageUrl) {
              console.log(`[RSS Ingest] Re-hosting image to GitHub: ${finalImageUrl.substring(0, 100)}`)
              try {
                const githubUrl = await githubStorage.uploadImage(finalImageUrl, item.title)
                if (githubUrl) {
                  finalImageUrl = githubUrl
                  console.log(`[RSS Ingest] ✓ Successfully re-hosted image to GitHub: ${githubUrl}`)
                } else {
                  console.warn(`[RSS Ingest] ⚠️ Failed to re-host image, keeping original URL`)
                }
              } catch (imageError) {
                console.error(`[RSS Ingest] ✗ Error re-hosting image:`, imageError)
                // Keep original URL if re-hosting fails
              }
            }

            // Insert new post
            const { data: newPost, error: insertError } = await supabaseAdmin
              .from('rss_posts')
              .insert({
                feed_id: feed.id,
                title: item.title,
                source_url: item.link,
                description: item.description || null,
                content: item.content || null,
                author: item.author || null,
                external_id: item.externalId || null,
                image_url: finalImageUrl,
                publication_date: item.publishedAt || new Date().toISOString(),
                processed_at: new Date().toISOString()
              })
              .select()
              .single()

            if (insertError) {
              console.error(`[RSS Ingest] Insert error for ${item.title.substring(0, 50)}:`, insertError.message, insertError.code)
              continue
            }

            if (newPost) {
              newPostsCount++
              console.log(`[RSS Ingest] Inserted new post: ${newPost.title.substring(0, 50)} [author: ${item.author ? 'yes' : 'no'}, content: ${item.content ? 'yes' : 'no'}, external_id: ${item.externalId ? 'yes' : 'no'}]`)

              // Score the post with multi-criteria AI
              try {
                await scorePost(newPost)
                console.log(`[RSS Ingest] Scored post: ${newPost.title.substring(0, 50)}`)
              } catch (scoreError) {
                console.error(`[RSS Ingest] Failed to score post ${newPost.title.substring(0, 50)}:`, scoreError)
                // Continue even if scoring fails
              }
            }
          } catch (itemError) {
            console.error(`[RSS Ingest] Error saving item from ${feed.name}:`, itemError)
            // Continue with next item
          }
        }

        totalFetched += items.length
        totalNewPosts += newPostsCount

        feedResults.push({
          name: feed.name,
          fetched: items.length,
          new: newPostsCount
        })

        console.log(`[RSS Ingest] Feed ${feed.name}: ${items.length} items fetched, ${newPostsCount} new posts saved`)

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[RSS Ingest] Error processing ${feed.name}:`, errorMessage)

        feedResults.push({
          name: feed.name,
          fetched: 0,
          new: 0,
          error: errorMessage
        })
        // Continue with next feed
      }
    }

    console.log(`[RSS Ingest] Complete: ${totalFetched} items fetched, ${totalNewPosts} new posts saved`)

    return NextResponse.json({
      success: true,
      message: `Processed ${feeds.length} feeds`,
      totalFetched,
      totalNewPosts,
      feeds: feedResults,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[RSS Ingest] Failed:', error)
    return NextResponse.json({
      error: 'RSS ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Score a post using multi-criteria AI
 */
async function scorePost(post: any) {
  // Helper to extract value from JSONB or plain text
  const extractValue = (value: any): string => {
    if (typeof value === 'string') return value
    if (typeof value === 'object' && value !== null) return JSON.stringify(value).replace(/^"|"$/g, '')
    return String(value)
  }

  // Get criteria configuration
  const { data: criteriaCountData } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'criteria_enabled_count')
    .single()

  const criteriaCount = criteriaCountData ? parseInt(extractValue(criteriaCountData.value)) : 0

  if (criteriaCount === 0) {
    console.log('[RSS Ingest] Multi-criteria scoring not configured, skipping scoring')
    return
  }

  // Fetch criteria settings
  const { data: criteriaSettings } = await supabaseAdmin
    .from('app_settings')
    .select('key, value')
    .or('key.like.criteria_%_name,key.like.criteria_%_weight,key.like.criteria_%_enabled')

  if (!criteriaSettings) {
    throw new Error('Failed to load criteria configuration')
  }

  // Build criteria array
  const criteria: Array<{ number: number; name: string; weight: number }> = []
  for (let i = 1; i <= criteriaCount; i++) {
    const nameKey = `criteria_${i}_name`
    const weightKey = `criteria_${i}_weight`
    const enabledKey = `criteria_${i}_enabled`

    const nameSetting = criteriaSettings.find(s => s.key === nameKey)
    const weightSetting = criteriaSettings.find(s => s.key === weightKey)
    const enabledSetting = criteriaSettings.find(s => s.key === enabledKey)

    const name = nameSetting ? extractValue(nameSetting.value) : `Criterion ${i}`
    const weight = weightSetting ? parseFloat(extractValue(weightSetting.value)) : 1.0
    const enabled = enabledSetting ? extractValue(enabledSetting.value) !== 'false' : true

    if (enabled) {
      criteria.push({ number: i, name, weight })
    }
  }

  console.log(`[RSS Ingest] Scoring with ${criteria.length} criteria`)

  // Evaluate each criterion
  const criteriaScores: Array<{ score: number; reason: string; weight: number }> = []

  for (const criterion of criteria) {
    const responseText = await callAIWithPrompt(
      `ai_prompt_criteria_${criterion.number}`,
      {
        title: post.title,
        description: post.description || '',
        content: post.content || '',
        hasImage: post.image_url ? 'true' : 'false'
      }
    )

    console.log(`[RSS Ingest] Raw AI response for criterion ${criterion.number}:`, typeof responseText, responseText?.toString().substring(0, 100))

    // Parse response
    let result: any
    try {
      result = typeof responseText === 'string' ? JSON.parse(responseText) : responseText
    } catch (parseError) {
      console.log(`[RSS Ingest] JSON parse failed for criterion ${criterion.number}, trying regex extraction`)
      const jsonMatch = (responseText as string).match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        console.error(`[RSS Ingest] Failed to parse criterion ${criterion.number} response:`, responseText)
        throw new Error(`Failed to parse criterion ${criterion.number} response`)
      }
    }

    console.log(`[RSS Ingest] Parsed result for criterion ${criterion.number}:`, { score: result.score, hasReason: !!result.reason })

    // Validate score
    if (typeof result.score !== 'number' || result.score < 0 || result.score > 10) {
      console.error(`[RSS Ingest] Invalid score from criterion ${criterion.number}:`, result.score)
      throw new Error(`Invalid score from criterion ${criterion.number}: ${result.score}`)
    }

    criteriaScores.push({
      score: result.score,
      reason: result.reason || 'No reason provided',
      weight: criterion.weight
    })
  }

  // Calculate weighted total score
  let totalWeightedScore = 0
  criteriaScores.forEach(({ score, weight }) => {
    totalWeightedScore += score * weight
  })

  console.log(`[RSS Ingest] Total weighted score: ${totalWeightedScore} (from ${criteriaScores.length} criteria)`)

  // Insert rating
  const ratingRecord: any = {
    post_id: post.id,
    total_score: totalWeightedScore
  }

  // Add multi-criteria fields
  criteriaScores.forEach((criterionScore, index) => {
    const criterionNum = index + 1
    ratingRecord[`criteria_${criterionNum}_score`] = criterionScore.score
    ratingRecord[`criteria_${criterionNum}_reason`] = criterionScore.reason
    ratingRecord[`criteria_${criterionNum}_weight`] = criterionScore.weight
  })

  console.log(`[RSS Ingest] Inserting rating record:`, { post_id: post.id, total_score: totalWeightedScore, criteria_count: criteriaScores.length })

  const { data: insertedRating, error: ratingError } = await supabaseAdmin
    .from('post_ratings')
    .insert(ratingRecord)
    .select()
    .single()

  if (ratingError) {
    console.error(`[RSS Ingest] Failed to insert rating for post ${post.id}:`, ratingError.message, ratingError.code)
    throw new Error(`Failed to insert rating: ${ratingError.message}`)
  }

  console.log(`[RSS Ingest] ✓ Successfully inserted rating with id: ${insertedRating?.id}`)
}

/**
 * Extract RSS items from XML text
 * Supports both RSS 2.0 and Atom formats
 */
function extractRSSItems(xml: string): Array<{title: string, link: string, description?: string, content?: string, imageUrl?: string, publishedAt?: string, author?: string, externalId?: string}> {
  const items: Array<{title: string, link: string, description?: string, content?: string, imageUrl?: string, publishedAt?: string, author?: string, externalId?: string}> = []

  // Try RSS 2.0 format first
  const rssItemMatches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi))

  for (const match of rssItemMatches) {
    const itemXml = match[1]

    const title = extractTag(itemXml, 'title')
    const link = extractTag(itemXml, 'link')
    const description = extractTag(itemXml, 'description')
    const contentEncoded = extractTag(itemXml, 'content:encoded') || extractTag(itemXml, 'content')
    const pubDate = extractTag(itemXml, 'pubDate')
    const author = extractTag(itemXml, 'dc:creator') || extractTag(itemXml, 'author')
    const guid = extractTag(itemXml, 'guid')

    // Use content:encoded if available, otherwise fall back to description
    const content = contentEncoded || description

    // Try to extract image
    let imageUrl: string | undefined
    const enclosureMatch = itemXml.match(/<enclosure[^>]*url="([^"]*)"[^>]*type="image/)
    if (enclosureMatch) {
      imageUrl = enclosureMatch[1]
    } else {
      const mediaMatch = itemXml.match(/<media:content[^>]*url="([^"]*)"/)
      if (mediaMatch) {
        imageUrl = mediaMatch[1]
      }
    }

    if (title && link) {
      items.push({
        title: cleanText(title),
        link: cleanText(link),
        description: description ? cleanText(description) : undefined,
        content: content ? cleanText(content) : undefined,
        imageUrl,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        author: author ? cleanText(author) : undefined,
        externalId: guid ? cleanText(guid) : link // Use guid if available, fallback to link
      })
    }
  }

  // If no RSS items found, try Atom format
  if (items.length === 0) {
    const atomEntryMatches = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi))

    for (const match of atomEntryMatches) {
      const entryXml = match[1]

      const title = extractTag(entryXml, 'title')
      const linkMatch = entryXml.match(/<link[^>]*href="([^"]*)"/)
      const link = linkMatch ? linkMatch[1] : extractTag(entryXml, 'id')
      const summary = extractTag(entryXml, 'summary')
      const contentTag = extractTag(entryXml, 'content')
      const published = extractTag(entryXml, 'published') || extractTag(entryXml, 'updated')
      const authorName = extractTag(entryXml, 'author')
      const id = extractTag(entryXml, 'id')

      // Use content if available, otherwise fall back to summary
      const content = contentTag || summary

      if (title && link) {
        items.push({
          title: cleanText(title),
          link: cleanText(link),
          description: summary ? cleanText(summary) : undefined,
          content: content ? cleanText(content) : undefined,
          publishedAt: published ? new Date(published).toISOString() : new Date().toISOString(),
          author: authorName ? cleanText(authorName) : undefined,
          externalId: id ? cleanText(id) : link
        })
      }
    }
  }

  return items
}

/**
 * Extract content from XML tag
 */
function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1] : null
}

/**
 * Clean text content (remove HTML, CDATA, trim)
 */
function cleanText(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')  // Remove CDATA
    .replace(/<[^>]+>/g, '')  // Remove HTML tags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

export const maxDuration = 600  // 10 minutes
