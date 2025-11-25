import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const campaignId = searchParams.get('campaign_id')

  if (!campaignId) {
    return NextResponse.json({ error: 'Missing campaign_id' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('articles')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('rank', { ascending: true, nullsFirst: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    count: data?.length || 0,
    articles: data?.map(a => ({
      id: a.id,
      headline: a.headline,
      rank: a.rank,
      is_active: a.is_active,
      skipped: a.skipped,
      final_position: a.final_position
    }))
  })
}
