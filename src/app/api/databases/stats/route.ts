import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: eventsCount, error: eventsError } = await supabaseAdmin
      .from('events')
      .select('id', { count: 'exact' })

    if (eventsError) {
      console.error('Error fetching events count:', eventsError)
      return NextResponse.json({ error: 'Failed to fetch events count' }, { status: 500 })
    }

    const { data: vrboCount, error: vrboError } = await supabaseAdmin
      .from('vrbo_listings')
      .select('id', { count: 'exact' })

    if (vrboError) {
      console.error('Error fetching VRBO count:', vrboError)
      // Don't fail the request if VRBO table doesn't exist yet
    }

    const databases = [
      {
        name: 'Local Events',
        description: 'Events pulled from Visit St. Cloud API',
        count: eventsCount?.length || 0,
        href: '/dashboard/databases/events'
      },
      {
        name: 'VRBO Listings',
        description: 'Minnesota Getaways properties for newsletters',
        count: vrboCount?.length || 0,
        href: '/dashboard/databases/vrbo'
      }
    ]

    return NextResponse.json({ databases })
  } catch (error) {
    console.error('Database stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}