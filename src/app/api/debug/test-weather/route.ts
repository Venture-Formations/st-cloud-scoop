import { NextRequest, NextResponse } from 'next/server'
import { fetchWeatherData, generateWeatherHTML } from '@/lib/weather'
import { generateWeatherImage } from '@/lib/weather-image'

export async function GET(request: NextRequest) {
  try {
    console.log('Testing weather system...')

    // Test weather data fetch
    const weatherData = await fetchWeatherData()
    console.log('Weather data fetched:', weatherData)

    // Test HTML generation
    const weatherHTML = generateWeatherHTML(weatherData)
    console.log('Weather HTML generated, length:', weatherHTML.length)

    // Test image generation (optional)
    let imageUrl = null
    try {
      imageUrl = await generateWeatherImage(weatherHTML)
      console.log('Weather image generated:', imageUrl)
    } catch (error) {
      console.log('Image generation failed (API key may not be set):', error)
    }

    return NextResponse.json({
      success: true,
      weatherData,
      htmlLength: weatherHTML.length,
      imageUrl,
      html: weatherHTML
    })
  } catch (error) {
    console.error('Weather test failed:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}