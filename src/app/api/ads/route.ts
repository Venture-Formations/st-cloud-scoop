import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET all ads with optional status filter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabaseAdmin
      .from('advertisements')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: ads, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ads })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch ads',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// POST - Create new ad (admin only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      title,
      body: adBody,
      word_count,
      business_name,
      contact_name,
      contact_email,
      contact_phone,
      business_address,
      business_website,
      frequency,
      times_paid
    } = body

    // Validation
    if (!title || !adBody || !business_name || !contact_name || !contact_email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: ad, error } = await supabaseAdmin
      .from('advertisements')
      .insert({
        title,
        body: adBody,
        word_count,
        business_name,
        contact_name,
        contact_email,
        contact_phone,
        business_address,
        business_website,
        frequency,
        times_paid,
        times_used: 0,
        status: 'approved', // Admin-created ads are pre-approved
        payment_status: 'paid',
        submission_date: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ad })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to create ad',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
