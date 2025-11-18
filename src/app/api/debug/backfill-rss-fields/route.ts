import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { GitHubImageStorage } from '@/lib/github-storage'

/**
 * Backfill missing RSS fields (author, external_id, image_url with GitHub upload)
 * for posts ingested today
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Backfill] Starting RSS fields backfill for today\'s posts...')

    // Initialize GitHub storage
    const githubStorage = new GitHubImageStorage()

    // Get today's date in local time
    const today = new Date().toISOString().split('T')[0]
    console.log('[Backfill] Backfilling posts from:', today)

    // Get all posts from today that need backfilling
    const { data: posts, error: postsError } = await supabaseAdmin
      .from('rss_posts')
      .select('*, feed:rss_feeds(*)')
      .gte('processed_at', `${today}T00:00:00`)
      .lte('processed_at', `${today}T23:59:59`)

    if (postsError) {
      throw new Error(`Failed to fetch posts: ${postsError.message}`)
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No posts found from today',
        updated: 0
      })
    }

    console.log(`[Backfill] Found ${posts.length} posts from today`)

    let successCount = 0
    let skipCount = 0
    let errorCount = 0
    const results: any[] = []

    // Process each post
    for (const post of posts) {
      try {
        console.log(`\n[Backfill] Processing: "${post.title}"`)

        // Check if post needs updating
        const needsUpdate = !post.author || !post.external_id || !post.image_url || !post.image_url.includes('github')

        if (!needsUpdate) {
          console.log('[Backfill] Post already has all fields, skipping')
          skipCount++
          continue
        }

        console.log('[Backfill] Post needs update:', {
          hasAuthor: !!post.author,
          hasExternalId: !!post.external_id,
          hasGithubImage: post.image_url?.includes('github')
        })

        // Fetch RSS feed
        const feedUrl = post.feed.url
        console.log(`[Backfill] Fetching feed: ${feedUrl}`)

        const response = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'St. Cloud Scoop RSS Reader/1.0'
          }
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const xmlText = await response.text()

        // Extract RSS items
        const items = extractRSSItems(xmlText)
        console.log(`[Backfill] Found ${items.length} items in feed`)

        // Find matching item (by title or source_url)
        const matchingItem = items.find(item =>
          item.title === post.title || item.link === post.source_url
        )

        if (!matchingItem) {
          console.warn(`[Backfill] No matching item found in feed for: ${post.title}`)
          errorCount++
          results.push({
            post_id: post.id,
            title: post.title,
            status: 'error',
            error: 'No matching item in RSS feed'
          })
          continue
        }

        console.log('[Backfill] Found matching RSS item')

        // Prepare update object
        const updates: any = {}

        // Update author if missing
        if (!post.author && matchingItem.author) {
          updates.author = matchingItem.author
          console.log(`[Backfill] Adding author: ${matchingItem.author}`)
        }

        // Update external_id if missing
        if (!post.external_id && matchingItem.externalId) {
          updates.external_id = matchingItem.externalId
          console.log(`[Backfill] Adding external_id: ${matchingItem.externalId}`)
        }

        // Update image_url if missing or not GitHub-hosted
        if (matchingItem.imageUrl && (!post.image_url || !post.image_url.includes('github'))) {
          console.log(`[Backfill] Processing image: ${matchingItem.imageUrl.substring(0, 100)}`)

          try {
            const githubUrl = await githubStorage.uploadImage(matchingItem.imageUrl, post.title)
            if (githubUrl) {
              updates.image_url = githubUrl
              console.log(`[Backfill] ✓ Image uploaded to GitHub: ${githubUrl}`)
            } else {
              // Keep original URL if GitHub upload fails
              updates.image_url = matchingItem.imageUrl
              console.warn(`[Backfill] ⚠️ GitHub upload failed, using original URL`)
            }
          } catch (imageError) {
            console.error(`[Backfill] ✗ Error uploading image:`, imageError)
            updates.image_url = matchingItem.imageUrl
          }
        }

        // Update post if there are changes
        if (Object.keys(updates).length > 0) {
          console.log(`[Backfill] Updating post with ${Object.keys(updates).length} fields:`, Object.keys(updates))

          const { error: updateError } = await supabaseAdmin
            .from('rss_posts')
            .update(updates)
            .eq('id', post.id)

          if (updateError) {
            throw new Error(`Update failed: ${updateError.message}`)
          }

          successCount++
          results.push({
            post_id: post.id,
            title: post.title,
            status: 'success',
            updated_fields: Object.keys(updates)
          })

          console.log(`[Backfill] ✓ Successfully updated post`)
        } else {
          console.log('[Backfill] No updates needed')
          skipCount++
        }

      } catch (error) {
        errorCount++
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Backfill] Error processing post ${post.id}:`, errorMsg)

        results.push({
          post_id: post.id,
          title: post.title,
          status: 'error',
          error: errorMsg
        })
      }
    }

    console.log(`\n[Backfill] Complete: ${successCount} updated, ${skipCount} skipped, ${errorCount} errors`)

    return NextResponse.json({
      success: true,
      message: `Backfill complete: ${successCount} updated, ${skipCount} skipped, ${errorCount} errors`,
      stats: {
        total: posts.length,
        updated: successCount,
        skipped: skipCount,
        errors: errorCount
      },
      results
    })

  } catch (error) {
    console.error('[Backfill] Error:', error)
    return NextResponse.json({
      error: 'Backfill failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
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
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1] : null
}

/**
 * Clean text content (remove HTML, CDATA, trim)
 */
function cleanText(text: string): string {
  return text
    .replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, '$1')  // Remove CDATA
    .replace(/<[^>]+>/g, '')  // Remove HTML tags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}
