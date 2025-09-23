import { NextRequest, NextResponse } from 'next/server'
import { getLatestWeatherForecast } from '@/lib/weather-manager'

export async function GET(request: NextRequest) {
  try {
    // Get the campaign date from query params (optional)
    const searchParams = new URL(request.url).searchParams
    const campaignDate = searchParams.get('date')

    console.log('Fetching cached weather forecast for campaign date:', campaignDate || 'latest')

    // For now, just get the latest forecast
    // TODO: In future, could filter by campaign date
    const forecast = await getLatestWeatherForecast()

    if (!forecast) {
      return NextResponse.json({
        success: false,
        error: 'No weather forecast available',
        message: 'No cached weather data found. Weather forecasts are automatically generated daily at 8:00 PM Central Time. The next generation will occur tonight.',
        scheduleInfo: {
          cronSchedule: '0 20 * * *',
          timezone: 'America/Chicago',
          description: 'Daily at 8:00 PM Central'
        }
      }, { status: 404 })
    }

    // Format response similar to the debug endpoint for compatibility
    return NextResponse.json({
      success: true,
      weatherData: forecast.weather_data,
      html: forecast.html_content,
      imageUrl: forecast.image_url,
      forecastDate: forecast.forecast_date,
      generatedAt: forecast.generated_at,
      cached: true,
      message: 'Showing cached weather forecast'
    })

  } catch (error) {
    console.error('Error fetching weather forecast:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch weather forecast',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}