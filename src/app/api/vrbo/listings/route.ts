import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { VrboListing } from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: listings, error } = await supabaseAdmin
      .from('vrbo_listings')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching VRBO listings:', error)
      return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 })
    }

    return NextResponse.json({ listings: listings || [] })
  } catch (error) {
    console.error('VRBO listings API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      title,
      main_image_url,
      city,
      bedrooms,
      bathrooms,
      sleeps,
      link,
      non_tracked_link,
      listing_type
    } = body

    // Validate required fields
    if (!title || !link || !listing_type) {
      return NextResponse.json(
        { error: 'Missing required fields: title, link, listing_type' },
        { status: 400 }
      )
    }

    if (!['Local', 'Greater'].includes(listing_type)) {
      return NextResponse.json(
        { error: 'listing_type must be either "Local" or "Greater"' },
        { status: 400 }
      )
    }

    const { data: listing, error } = await supabaseAdmin
      .from('vrbo_listings')
      .insert([{
        title,
        main_image_url,
        city,
        bedrooms: bedrooms ? parseInt(bedrooms) : null,
        bathrooms: bathrooms ? parseFloat(bathrooms) : null,
        sleeps: sleeps ? parseInt(sleeps) : null,
        link,
        non_tracked_link,
        listing_type,
        is_active: true
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating VRBO listing:', error)
      return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 })
    }

    return NextResponse.json({ listing }, { status: 201 })
  } catch (error) {
    console.error('VRBO listings creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}