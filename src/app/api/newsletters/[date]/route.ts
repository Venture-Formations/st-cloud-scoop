import { NextRequest, NextResponse } from 'next/server'
import { newsletterArchiver } from '@/lib/newsletter-archiver'

interface RouteParams {
  params: Promise<{
    date: string
  }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { date } = await params

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid date format. Expected YYYY-MM-DD'
        },
        { status: 400 }
      )
    }

    // Fetch archived newsletter
    const newsletter = await newsletterArchiver.getArchivedNewsletter(date, 'stcscoop')

    if (!newsletter) {
      return NextResponse.json(
        {
          success: false,
          error: 'Newsletter not found',
          newsletter: null
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      newsletter
    })

  } catch (error) {
    console.error('Error fetching newsletter:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch newsletter',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
