import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    console.log('Checking RSS post image status...')

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

    console.log(`Found ${excludedSources.length} excluded sources`)

    // Count total posts with images
    const { count: totalWithImages, error: totalError } = await supabaseAdmin
      .from('rss_posts')
      .select('*', { count: 'exact', head: true })
      .not('image_url', 'is', null)

    if (totalError) {
      console.error('Error counting total posts with images:', totalError)
      return NextResponse.json({
        success: false,
        error: totalError.message
      }, { status: 500 })
    }

    // Count GitHub-hosted images
    const { count: githubHosted, error: githubError } = await supabaseAdmin
      .from('rss_posts')
      .select('*', { count: 'exact', head: true })
      .not('image_url', 'is', null)
      .or('image_url.like.https://raw.githubusercontent.com%,image_url.like.https://github.com%,image_url.like.https://cdn.jsdelivr.net%')

    if (githubError) {
      console.error('Error counting GitHub-hosted images:', githubError)
      return NextResponse.json({
        success: false,
        error: githubError.message
      }, { status: 500 })
    }

    // Count non-GitHub-hosted images that need migration
    const { count: needsMigration, error: migrationError } = await supabaseAdmin
      .from('rss_posts')
      .select('*', { count: 'exact', head: true })
      .not('image_url', 'is', null)
      .not('image_url', 'like', 'https://raw.githubusercontent.com%')
      .not('image_url', 'like', 'https://github.com%')
      .not('image_url', 'like', 'https://cdn.jsdelivr.net%')

    if (migrationError) {
      console.error('Error counting images needing migration:', migrationError)
      return NextResponse.json({
        success: false,
        error: migrationError.message
      }, { status: 500 })
    }

    // Get sample of posts needing migration
    const { data: samplePosts, error: sampleError } = await supabaseAdmin
      .from('rss_posts')
      .select('id, title, author, image_url, created_at')
      .not('image_url', 'is', null)
      .not('image_url', 'like', 'https://raw.githubusercontent.com%')
      .not('image_url', 'like', 'https://github.com%')
      .not('image_url', 'like', 'https://cdn.jsdelivr.net%')
      .order('created_at', { ascending: false })
      .limit(20)

    if (sampleError) {
      console.error('Error fetching sample posts:', sampleError)
    }

    // Separate sample posts by excluded source status
    const postsFromExcludedSources = samplePosts?.filter(p =>
      excludedSources.includes(p.author || '(No Author)')
    ) || []

    const postsToMigrate = samplePosts?.filter(p =>
      !excludedSources.includes(p.author || '(No Author)')
    ) || []

    // Count posts from excluded sources that have images
    const { count: excludedSourcesWithImages, error: excludedCountError } = await supabaseAdmin
      .from('rss_posts')
      .select('*', { count: 'exact', head: true })
      .not('image_url', 'is', null)
      .in('author', excludedSources.length > 0 ? excludedSources : ['__NO_MATCH__'])

    if (excludedCountError) {
      console.error('Error counting excluded source images:', excludedCountError)
    }

    // Analyze image URL domains
    const { data: allNonGithubPosts } = await supabaseAdmin
      .from('rss_posts')
      .select('author, image_url')
      .not('image_url', 'is', null)
      .not('image_url', 'like', 'https://raw.githubusercontent.com%')
      .not('image_url', 'like', 'https://github.com%')
      .not('image_url', 'like', 'https://cdn.jsdelivr.net%')

    const domainCounts: Record<string, number> = {}
    let postsFromExcludedSourcesCount = 0
    let postsToMigrateCount = 0

    if (allNonGithubPosts) {
      allNonGithubPosts.forEach(post => {
        const isExcluded = excludedSources.includes(post.author || '(No Author)')

        if (isExcluded) {
          postsFromExcludedSourcesCount++
        } else {
          postsToMigrateCount++
        }

        try {
          const url = new URL(post.image_url!)
          const domain = url.hostname
          const key = isExcluded ? `${domain} (excluded source)` : domain
          domainCounts[key] = (domainCounts[key] || 0) + 1
        } catch {
          const key = isExcluded ? 'invalid-url (excluded source)' : 'invalid-url'
          domainCounts[key] = (domainCounts[key] || 0) + 1
        }
      })
    }

    const sortedDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([domain, count]) => ({ domain, count }))

    return NextResponse.json({
      success: true,
      summary: {
        totalPostsWithImages: totalWithImages || 0,
        githubHosted: githubHosted || 0,
        needsMigration: needsMigration || 0,
        postsToMigrate: postsToMigrateCount,
        postsFromExcludedSources: postsFromExcludedSourcesCount,
        excludedSourcesWithImagesCount: excludedSourcesWithImages || 0,
        percentageMigrated: totalWithImages
          ? `${(((githubHosted || 0) / totalWithImages) * 100).toFixed(1)}%`
          : '0%'
      },
      excludedSources: {
        count: excludedSources.length,
        sources: excludedSources
      },
      topImageDomains: sortedDomains,
      samplePostsToMigrate: postsToMigrate.map(post => ({
        id: post.id,
        title: post.title,
        author: post.author,
        imageUrl: post.image_url,
        createdAt: post.created_at
      })),
      samplePostsFromExcludedSources: postsFromExcludedSources.map(post => ({
        id: post.id,
        title: post.title,
        author: post.author,
        imageUrl: post.image_url,
        willBeNullified: true,
        createdAt: post.created_at
      })),
      nextSteps: needsMigration && needsMigration > 0
        ? [
            `1. Review the sample posts and top domains (${postsToMigrateCount} posts will be migrated, ${postsFromExcludedSourcesCount} from excluded sources will have images set to null)`,
            '2. Run a dry run: GET /api/debug/backfill-rss-images?dryRun=true',
            '3. When ready, run the actual migration: GET /api/debug/backfill-rss-images',
            '4. Optional: Limit the number of images to process: GET /api/debug/backfill-rss-images?limit=100',
            `5. Note: Images from excluded sources (${excludedSources.join(', ')}) will be set to NULL, not migrated`
          ]
        : ['All images are already hosted on GitHub! No migration needed.']
    })

  } catch (error) {
    console.error('Fatal error checking image status:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
