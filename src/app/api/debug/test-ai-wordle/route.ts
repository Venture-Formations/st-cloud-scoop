import { NextRequest, NextResponse } from 'next/server'
import { getWordleDataForDate } from '@/lib/wordle-scraper'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const targetDate = searchParams.get('date') || '2025-09-29'

    console.log('🧩 Testing AI-powered Wordle scraping for:', targetDate)

    // Test the AI-powered scraping
    const wordleData = await getWordleDataForDate(targetDate)
    console.log('AI scraping result:', wordleData)

    return NextResponse.json({
      success: true,
      date: targetDate,
      wordleData: wordleData,
      debug: {
        message: 'Check Vercel function logs for detailed AI analysis output'
      }
    })

  } catch (error) {
    console.error('❌ AI Wordle scraping test failed:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : null
    }, { status: 500 })
  }
}