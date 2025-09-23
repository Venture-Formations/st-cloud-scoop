import { NextRequest, NextResponse } from 'next/server'
import { fetchWeatherData } from '@/lib/weather'

export async function GET(request: NextRequest) {
  try {
    console.log('Testing weather day headers...')

    const weatherData = await fetchWeatherData()

    const dayHeaders = weatherData.map((day, index) => ({
      position: index,
      dayHeader: day.day,
      dateLabel: day.dateLabel,
      expectedPattern: index === 0 ? 'TODAY' : index === 1 ? 'TOMORROW' : 'DAY_NAME'
    }))

    return NextResponse.json({
      success: true,
      message: 'Day headers test',
      dayHeaders,
      totalDays: weatherData.length
    })

  } catch (error) {
    console.error('Day headers test failed:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}