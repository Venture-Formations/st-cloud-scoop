import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { authOptions } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: campaignId } = await params
    const body = await request.json()
    const { articleOrders } = body

    if (!Array.isArray(articleOrders)) {
      return NextResponse.json({ error: 'articleOrders must be an array' }, { status: 400 })
    }

    // Update each article's rank
    console.log('Updating article ranks:', articleOrders.map(o => `Article ${o.articleId} -> rank ${o.rank}`).join(', '))

    const updatePromises = articleOrders.map(({ articleId, rank }) =>
      supabaseAdmin
        .from('articles')
        .update({ rank })
        .eq('id', articleId)
        .eq('campaign_id', campaignId)
    )

    const results = await Promise.all(updatePromises)
    console.log('Rank update results:', results.map((r, i) => `Article ${articleOrders[i].articleId}: ${r.error ? 'ERROR' : 'SUCCESS'}`).join(', '))

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Failed to reorder articles:', error)
    return NextResponse.json({
      error: 'Failed to reorder articles',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}