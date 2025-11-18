import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { GitHubImageStorage } from '@/lib/github-storage'

export const maxDuration = 300 // 5 minute timeout for backfilling images

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dryRun') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')

    console.log(`Starting RSS image backfill (dryRun: ${dryRun}, limit: ${limit})...`)

    // Get excluded RSS sources from settings
    const { data: excludedSettings } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'excluded_rss_sources')
      .single()

    // Value is already parsed as JSONB from database
    const excludedSources: string[] = excludedSettings?.value
      ? (Array.isArray(excludedSettings.value) ? excludedSettings.value : JSON.parse(excludedSettings.value))
      : []

    console.log(`Found ${excludedSources.length} excluded sources:`, excludedSources)

    // Find all RSS posts with non-GitHub image URLs
    const { data: postsToUpdate, error: queryError } = await supabaseAdmin
      .from('rss_posts')
      .select('id, title, author, image_url')
      .not('image_url', 'is', null)
      .not('image_url', 'like', 'https://raw.githubusercontent.com%')
      .not('image_url', 'like', 'https://github.com%')
      .not('image_url', 'like', 'https://cdn.jsdelivr.net%')
      .limit(limit)

    if (queryError) {
      console.error('Error querying posts:', queryError)
      return NextResponse.json({
        success: false,
        error: queryError.message
      }, { status: 500 })
    }

    if (!postsToUpdate || postsToUpdate.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No posts found that need image migration',
        postsFound: 0
      })
    }

    console.log(`Found ${postsToUpdate.length} posts with non-GitHub images`)

    // Separate posts by whether their source is excluded
    const postsWithExcludedSources = postsToUpdate.filter(p =>
      excludedSources.includes(p.author || '(No Author)')
    )
    const postsToMigrate = postsToUpdate.filter(p =>
      !excludedSources.includes(p.author || '(No Author)')
    )

    console.log(`Posts breakdown: ${postsToMigrate.length} to migrate, ${postsWithExcludedSources.length} from excluded sources`)

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: 'Dry run complete - no changes made',
        postsFound: postsToUpdate.length,
        postsToMigrate: postsToMigrate.length,
        postsFromExcludedSources: postsWithExcludedSources.length,
        excludedSources: excludedSources,
        samplePostsToMigrate: postsToMigrate.slice(0, 10).map(p => ({
          id: p.id,
          title: p.title,
          author: p.author,
          currentImageUrl: p.image_url
        })),
        samplePostsFromExcludedSources: postsWithExcludedSources.slice(0, 10).map(p => ({
          id: p.id,
          title: p.title,
          author: p.author,
          currentImageUrl: p.image_url,
          willBeSetToNull: true
        }))
      })
    }

    // Initialize GitHub storage
    const githubStorage = new GitHubImageStorage()

    const results = {
      total: postsToUpdate.length,
      toMigrate: postsToMigrate.length,
      fromExcludedSources: postsWithExcludedSources.length,
      successful: 0,
      nullified: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{
        postId: string
        title: string
        author: string
        originalUrl: string
        error: string
      }>
    }

    // First, handle posts from excluded sources - set their image_url to null
    console.log(`Setting image_url to null for ${postsWithExcludedSources.length} posts from excluded sources...`)
    for (const post of postsWithExcludedSources) {
      try {
        const { error: updateError } = await supabaseAdmin
          .from('rss_posts')
          .update({
            image_url: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', post.id)

        if (updateError) {
          console.error(`Failed to nullify image for excluded source post ${post.id}:`, updateError)
          results.failed++
          results.errors.push({
            postId: post.id,
            title: post.title || 'Untitled',
            author: post.author || '(No Author)',
            originalUrl: post.image_url || 'Unknown',
            error: `Failed to nullify image: ${updateError.message}`
          })
        } else {
          console.log(`✓ Nullified image for excluded source: ${post.author}`)
          results.nullified++
        }
      } catch (error) {
        console.error(`Error processing excluded source post ${post.id}:`, error)
        results.failed++
        results.errors.push({
          postId: post.id,
          title: post.title || 'Untitled',
          author: post.author || '(No Author)',
          originalUrl: post.image_url || 'Unknown',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Now process posts that should be migrated
    for (let i = 0; i < postsToMigrate.length; i++) {
      const post = postsToMigrate[i]
      console.log(`[${i + 1}/${postsToMigrate.length}] Processing: "${post.title}" (Author: ${post.author})`)
      console.log(`Original image URL: ${post.image_url}`)

      try {
        // Skip if no image URL (shouldn't happen due to query, but safety check)
        if (!post.image_url) {
          console.log('No image URL, skipping')
          results.skipped++
          continue
        }

        // Try to upload image to GitHub
        const githubUrl = await githubStorage.uploadImage(post.image_url, post.title || 'Untitled')

        if (githubUrl) {
          // Update database with GitHub URL
          const { error: updateError } = await supabaseAdmin
            .from('rss_posts')
            .update({
              image_url: githubUrl,
              updated_at: new Date().toISOString()
            })
            .eq('id', post.id)

          if (updateError) {
            console.error(`Failed to update database for post ${post.id}:`, updateError)
            results.failed++
            results.errors.push({
              postId: post.id,
              title: post.title || 'Untitled',
              author: post.author || '(No Author)',
              originalUrl: post.image_url,
              error: `Database update failed: ${updateError.message}`
            })
          } else {
            console.log(`✓ Successfully migrated image: ${githubUrl}`)
            results.successful++
          }
        } else {
          console.warn(`Failed to upload image to GitHub for post ${post.id}`)
          results.failed++
          results.errors.push({
            postId: post.id,
            title: post.title || 'Untitled',
            author: post.author || '(No Author)',
            originalUrl: post.image_url,
            error: 'Failed to upload image to GitHub (check logs for details)'
          })
        }

        // Add a small delay between uploads to avoid rate limiting
        if (i < postsToMigrate.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)) // 1 second delay
        }

      } catch (error) {
        console.error(`Error processing post ${post.id}:`, error)
        results.failed++
        results.errors.push({
          postId: post.id,
          title: post.title || 'Untitled',
          author: post.author || '(No Author)',
          originalUrl: post.image_url || 'Unknown',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log('Backfill complete!')
    console.log(`Total: ${results.total}, To Migrate: ${results.toMigrate}, From Excluded: ${results.fromExcludedSources}`)
    console.log(`Successful Migrations: ${results.successful}, Nullified: ${results.nullified}, Failed: ${results.failed}, Skipped: ${results.skipped}`)

    return NextResponse.json({
      success: true,
      message: 'Image backfill complete',
      results: {
        total: results.total,
        toMigrate: results.toMigrate,
        fromExcludedSources: results.fromExcludedSources,
        successfulMigrations: results.successful,
        nullifiedExcludedSources: results.nullified,
        failed: results.failed,
        skipped: results.skipped,
        migrationSuccessRate: results.toMigrate > 0
          ? `${((results.successful / results.toMigrate) * 100).toFixed(1)}%`
          : '0%'
      },
      excludedSources: excludedSources,
      errors: results.errors.length > 0 ? results.errors : undefined
    })

  } catch (error) {
    console.error('Fatal error during backfill:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
