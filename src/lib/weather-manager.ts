// Weather database operations and management

import { createClient } from '@supabase/supabase-js'
import { fetchWeatherData, generateWeatherHTML, generateNewsletterWeatherHTML } from './weather'
import { generateWeatherImage } from './weather-image'
import type { WeatherForecast } from '@/types/database'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Generate and store daily weather forecast
 * Called by cron job at 8pm daily
 */
export async function generateDailyWeatherForecast(): Promise<WeatherForecast> {
  console.log('Starting daily weather forecast generation...')

  try {
    // Fetch weather data from NWS
    const weatherData = await fetchWeatherData()
    console.log('Weather data fetched successfully')

    // Generate HTML content
    const weatherHTML = generateWeatherHTML(weatherData)
    console.log('Weather HTML generated')

    // Generate image (optional)
    let imageUrl: string | null = null
    try {
      imageUrl = await generateWeatherImage(weatherHTML)
      if (imageUrl) {
        console.log('Weather image generated successfully')
      }
    } catch (error) {
      console.log('Weather image generation failed, continuing without image:', error)
    }

    // Calculate forecast date (tomorrow in Central Time)
    const now = new Date()
    const tomorrow = new Date(now.getTime() + (24 * 60 * 60 * 1000))
    const forecastDate = tomorrow.toISOString().split('T')[0] // YYYY-MM-DD format

    // Prepare forecast data
    const forecastData: Omit<WeatherForecast, 'id' | 'created_at' | 'updated_at'> = {
      forecast_date: forecastDate,
      generated_at: new Date().toISOString(),
      weather_data: weatherData,
      html_content: weatherHTML,
      image_url: imageUrl,
      is_active: true
    }

    // Store in database (upsert to handle duplicates)
    const { data, error } = await supabase
      .from('weather_forecasts')
      .upsert(forecastData, {
        onConflict: 'forecast_date'
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }

    console.log('Weather forecast stored successfully:', data.id)
    return data

  } catch (error) {
    console.error('Daily weather forecast generation failed:', error)
    throw error
  }
}

/**
 * Get weather forecast for a specific campaign
 * Returns newsletter-formatted HTML
 */
export async function getWeatherForCampaign(campaignId: string): Promise<string | null> {
  try {
    // For now, get the latest active forecast
    // In future, could be tied to campaign date
    const { data, error } = await supabase
      .from('weather_forecasts')
      .select('*')
      .eq('is_active', true)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      console.log('No active weather forecast found')
      return null
    }

    // Generate newsletter-formatted HTML
    const newsletterHTML = generateNewsletterWeatherHTML(data.weather_data)
    return newsletterHTML

  } catch (error) {
    console.error('Error fetching weather for campaign:', error)
    return null
  }
}

/**
 * Get the latest weather forecast
 */
export async function getLatestWeatherForecast(): Promise<WeatherForecast | null> {
  try {
    const { data, error } = await supabase
      .from('weather_forecasts')
      .select('*')
      .eq('is_active', true)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      console.log('No weather forecast found:', error.message)
      return null
    }

    return data

  } catch (error) {
    console.error('Error fetching latest weather forecast:', error)
    return null
  }
}

/**
 * Mark old forecasts as inactive (cleanup)
 */
export async function cleanupOldForecasts(): Promise<void> {
  try {
    // Mark forecasts older than 7 days as inactive
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 7)

    const { error } = await supabase
      .from('weather_forecasts')
      .update({ is_active: false })
      .lt('forecast_date', cutoffDate.toISOString().split('T')[0])

    if (error) {
      throw new Error(`Cleanup error: ${error.message}`)
    }

    console.log('Old weather forecasts cleaned up')

  } catch (error) {
    console.error('Error cleaning up old forecasts:', error)
  }
}