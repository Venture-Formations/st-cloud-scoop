import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const hasApiKey = !!process.env.HTML_CSS_TO_IMAGE_API_KEY
    const apiKeyLength = process.env.HTML_CSS_TO_IMAGE_API_KEY?.length || 0

    return NextResponse.json({
      hasApiKey,
      apiKeyLength,
      // Don't expose the actual key value
      preview: process.env.HTML_CSS_TO_IMAGE_API_KEY ?
        `${process.env.HTML_CSS_TO_IMAGE_API_KEY.substring(0, 8)}...` :
        'Not set'
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}