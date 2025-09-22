import { NextRequest, NextResponse } from 'next/server'

// St. Cloud, MN coordinates (approximately)
const LATITUDE = 45.5608
const LONGITUDE = -94.1622

export async function GET(request: NextRequest) {
  try {
    console.log('Fetching raw NWS periods for debugging...')

    // Calculate target start date (24 hours from now for "tomorrow")
    const now = new Date()
    const targetStartDate = new Date(now.getTime() + (24 * 60 * 60 * 1000))

    console.log('Current time:', now.toISOString())
    console.log('Target start date:', targetStartDate.toISOString())

    // Get NWS grid info for St. Cloud
    const pointsResponse = await fetch(
      `https://api.weather.gov/points/${LATITUDE},${LONGITUDE}`,
      {
        headers: {
          'User-Agent': 'St. Cloud Scoop Newsletter (scoop@stcscoop.com)'
        }
      }
    )

    if (!pointsResponse.ok) {
      throw new Error(`Points API failed: ${pointsResponse.status}`)
    }

    const pointsData = await pointsResponse.json()
    const forecastUrl = pointsData.properties.forecast

    // Get forecast data
    const forecastResponse = await fetch(forecastUrl, {
      headers: {
        'User-Agent': 'St. Cloud Scoop Newsletter (scoop@stcscoop.com)'
      }
    })

    if (!forecastResponse.ok) {
      throw new Error(`Forecast API failed: ${forecastResponse.status}`)
    }

    const forecastData = await forecastResponse.json()
    const periods = forecastData.properties.periods

    // Analyze periods for the next 3 days
    const relevantPeriods = periods.slice(0, 8).map((period: any) => ({
      name: period.name,
      startTime: period.startTime,
      endTime: period.endTime,
      isDaytime: period.isDaytime,
      temperature: period.temperature,
      temperatureUnit: period.temperatureUnit,
      shortForecast: period.shortForecast,
      dateKey: new Date(period.startTime).toDateString()
    }))

    return NextResponse.json({
      success: true,
      currentTime: now.toISOString(),
      targetStartDate: targetStartDate.toISOString(),
      relevantPeriods,
      totalPeriods: periods.length
    })

  } catch (error) {
    console.error('Weather periods debug failed:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}