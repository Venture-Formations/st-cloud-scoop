import { NextRequest, NextResponse } from 'next/server'
import { generateDailyWeatherForecast, cleanupOldForecasts } from '@/lib/weather-manager'

export async function GET(request: NextRequest) {
  console.log('🌤️ Starting weather forecast generation cron job...')

  try {
    // Verify cron secret for security
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')

    if (secret !== process.env.CRON_SECRET) {
      console.log('❌ Unauthorized cron request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ Cron authentication successful')

    // Generate new weather forecast
    const forecast = await generateDailyWeatherForecast()
    console.log('✅ Weather forecast generated:', forecast.id)

    // Cleanup old forecasts
    await cleanupOldForecasts()
    console.log('✅ Old forecasts cleaned up')

    return NextResponse.json({
      success: true,
      message: 'Weather forecast generated successfully',
      forecast: {
        id: forecast.id,
        forecast_date: forecast.forecast_date,
        generated_at: forecast.generated_at,
        has_image: !!forecast.image_url,
        weather_days: forecast.weather_data.length
      }
    })

  } catch (error) {
    console.error('❌ Weather cron job failed:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Allow manual testing with secret parameter
export async function POST(request: NextRequest) {
  return GET(request)
}