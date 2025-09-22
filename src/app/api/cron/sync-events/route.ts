import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('=== AUTOMATED EVENTS SYNC STARTED ===')
    console.log('Time:', new Date().toISOString())

    // Call the events sync endpoint
    const syncResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/events/sync?secret=${process.env.CRON_SECRET}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!syncResponse.ok) {
      const errorData = await syncResponse.json().catch(() => ({}))
      throw new Error(`Events sync failed: ${syncResponse.status} - ${errorData.message || 'Unknown error'}`)
    }

    const syncResult = await syncResponse.json()

    console.log('Events sync completed successfully:', syncResult.summary)

    return NextResponse.json({
      success: true,
      message: 'Events sync completed',
      result: syncResult,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Automated events sync failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Automated events sync failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// GET endpoint for manual testing
export async function GET(request: NextRequest) {
  try {
    // Check if secret parameter is provided
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    console.log('Received secret length:', secret?.length, 'Expected length:', process.env.CRON_SECRET?.length)
    console.log('Secrets match:', secret === process.env.CRON_SECRET)

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized - secret required' }, { status: 401 })
    }

    // Call the POST method with proper authorization header
    const fakeRequest = new Request(request.url, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${process.env.CRON_SECRET}`,
        'content-type': 'application/json'
      }
    })

    return POST(fakeRequest as NextRequest)

  } catch (error) {
    return NextResponse.json({
      error: 'Events sync test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}