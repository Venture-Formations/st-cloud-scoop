import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Delete articles by ID
 * GET /api/debug/delete-articles?ids=id1,id2,id3
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ids = searchParams.get('ids')

  if (!ids) {
    return NextResponse.json({ error: 'Missing ids parameter (comma-separated)' }, { status: 400 })
  }

  const idList = ids.split(',').map(id => id.trim())
  console.log(`[DELETE] Deleting ${idList.length} articles:`, idList)

  const { error } = await supabaseAdmin
    .from('articles')
    .delete()
    .in('id', idList)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: `Deleted ${idList.length} articles`,
    deleted_ids: idList
  })
}
