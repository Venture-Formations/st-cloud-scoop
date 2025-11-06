import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * RSS Ingestion Cron
 * Runs every hour to keep RSS posts table fresh
 * Separate from campaign processing for better reliability
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
            // Check if post already exists (by title + link)
            const { data: existingPost } = await supabaseAdmin
              .from('rss_posts')
              .select('id')
              .eq('feed_id', feed.id)
              .eq('title', item.title)
              .eq('link', item.link)
              .single()

            if (existingPost) {
              // Post already exists, skip
              continue
            }

            // Insert new post
            const { error: insertError } = await supabaseAdmin
              .from('rss_posts')
              .insert({
                feed_id: feed.id,
                title: item.title,
                link: item.link,
                description: item.description || null,
                published_at: item.publishedAt || new Date().toISOString(),
                processed_at: new Date().toISOString()
              })

            if (!insertError) {
              newPostsCount++
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
 * Extract RSS items from XML text
 * Supports both RSS 2.0 and Atom formats
 */
function extractRSSItems(xml: string): Array<{title: string, link: string, description?: string, publishedAt?: string}> {
  const items: Array<{title: string, link: string, description?: string, publishedAt?: string}> = []

  // Try RSS 2.0 format first
  const rssItemMatches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi))

  for (const match of rssItemMatches) {
    const itemXml = match[1]

    const title = extractTag(itemXml, 'title')
    const link = extractTag(itemXml, 'link')
    const description = extractTag(itemXml, 'description')
    const pubDate = extractTag(itemXml, 'pubDate')

    if (title && link) {
      items.push({
        title: cleanText(title),
        link: cleanText(link),
        description: description ? cleanText(description) : undefined,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
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
      const summary = extractTag(entryXml, 'summary') || extractTag(entryXml, 'content')
      const published = extractTag(entryXml, 'published') || extractTag(entryXml, 'updated')

      if (title && link) {
        items.push({
          title: cleanText(title),
          link: cleanText(link),
          description: summary ? cleanText(summary) : undefined,
          publishedAt: published ? new Date(published).toISOString() : new Date().toISOString()
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

export const maxDuration = 300  // 5 minutes
