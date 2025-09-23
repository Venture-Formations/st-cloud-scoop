// Weather database operations and management

import { supabaseAdmin } from './supabase'
import { fetchWeatherData, generateWeatherHTML, generateNewsletterWeatherHTML } from './weather'
import { generateWeatherImage } from './weather-image'
import type { WeatherForecast } from '@/types/database'

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
      imageUrl = await generateWeatherImage(weatherData)
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
    const supabase = supabaseAdmin
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
    // First get the campaign to find its date
    const supabase = supabaseAdmin
    const { data: campaign, error: campaignError } = await supabase
      .from('newsletter_campaigns')
      .select('date')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      console.log('Campaign not found for weather lookup:', campaignId)
      return null
    }

    console.log('Looking for weather forecast for newsletter date:', campaign.date)

    // Get weather forecast that matches the newsletter date
    const { data, error } = await supabase
      .from('weather_forecasts')
      .select('*')
      .eq('forecast_date', campaign.date)
      .eq('is_active', true)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      console.log('No weather forecast found for newsletter date:', campaign.date)
      return null
    }

    console.log('Found weather forecast for date:', data.forecast_date, 'with image:', !!data.image_url)

    // Use GitHub-hosted image if available, otherwise fall back to HTML
    if (data.image_url) {
      const imageBasedWeatherHTML = `
<table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #f7f7f7; border-radius: 10px; margin-top: 10px; max-width: 990px; margin: 0 auto; background-color: #f7f7f7; font-family: Arial, sans-serif;">
  <tr>
    <td style="padding: 5px;">
      <h2 style="font-size: 1.625em; line-height: 1.16em; font-family: Arial, sans-serif; color: #1877F2; margin: 0; padding: 0;">Local Weather</h2>
    </td>
  </tr>
  <tr>
    <td style="padding: 8px; text-align: center;">
      <img src="${data.image_url}" alt="3-Day Weather Forecast for St. Cloud" style="max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 0 auto;">
    </td>
  </tr>
</table>
<br>`
      return imageBasedWeatherHTML
    } else {
      // Fallback to HTML text format
      const newsletterHTML = generateNewsletterWeatherHTML(data.weather_data)
      return newsletterHTML
    }

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
    const supabase = supabaseAdmin
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
 * Get weather forecast for a specific date
 */
export async function getWeatherForecastByDate(forecastDate: string): Promise<WeatherForecast | null> {
  try {
    const supabase = supabaseAdmin
    const { data, error } = await supabase
      .from('weather_forecasts')
      .select('*')
      .eq('forecast_date', forecastDate)
      .eq('is_active', true)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      console.log(`No weather forecast found for date ${forecastDate}:`, error.message)
      return null
    }

    return data

  } catch (error) {
    console.error(`Error fetching weather forecast for date ${forecastDate}:`, error)
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

    const supabase = supabaseAdmin
    const { error } = await supabase
      .from('weather_forecasts')
      .update({ is_active: false })
      .lt('forecast_date', cutoffDate.toISOString().split('T')[0])

    if (error) {
      throw new Error(`Cleanup error: ${error.message}`)
    }

    console.log('Old weather forecasts cleaned up')

    // Also cleanup old weather images from GitHub (keep 30 days)
    try {
      const { GitHubImageStorage } = await import('./github-storage')
      const githubStorage = new GitHubImageStorage()
      const deletedCount = await githubStorage.cleanupOldWeatherImages(30)
      console.log(`Cleaned up ${deletedCount} old weather images from GitHub`)
    } catch (githubError) {
      console.log('GitHub weather image cleanup skipped:', githubError instanceof Error ? githubError.message : 'Unknown error')
    }

  } catch (error) {
    console.error('Error cleaning up old forecasts:', error)
  }
}