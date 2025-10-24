import { NextResponse } from 'next/server'
import { newsletterArchiver } from '@/lib/newsletter-archiver'

export async function GET() {
  try {
    const newsletters = await newsletterArchiver.getArchiveList(100, 'stcscoop')

    return NextResponse.json({
      success: true,
      newsletters,
      count: newsletters.length
    })
  } catch (error) {
    console.error('Error fetching archived newsletters:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch newsletters',
        newsletters: []
      },
      { status: 500 }
    )
  }
}
