import { NextRequest, NextResponse } from 'next/server'
import { RSSProcessor } from '@/lib/rss-processor'

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const cronSecret = request.headers.get('Authorization')
    if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const processor = new RSSProcessor()
    await processor.processAllFeeds()

    return NextResponse.json({
      success: true,
      message: 'RSS processing completed successfully'
    })

  } catch (error) {
    console.error('RSS processing failed:', error)

    return NextResponse.json({
      error: 'RSS processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Manual trigger endpoint (for testing/admin use)
export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated (for manual testing)
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const processor = new RSSProcessor()
    await processor.processAllFeeds()

    return NextResponse.json({
      success: true,
      message: 'RSS processing completed successfully'
    })

  } catch (error) {
    console.error('RSS processing failed:', error)

    return NextResponse.json({
      error: 'RSS processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}