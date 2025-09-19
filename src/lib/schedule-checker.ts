import { supabaseAdmin } from './supabase'

interface ScheduleSettings {
  reviewScheduleEnabled: boolean
  dailyScheduleEnabled: boolean
  rssProcessingTime: string
  campaignCreationTime: string
  scheduledSendTime: string
  dailyCampaignCreationTime: string
  dailyScheduledSendTime: string
}

export class ScheduleChecker {
  private static async getScheduleSettings(): Promise<ScheduleSettings> {
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .in('key', [
        'email_reviewScheduleEnabled',
        'email_dailyScheduleEnabled',
        'email_rssProcessingTime',
        'email_campaignCreationTime',
        'email_scheduledSendTime',
        'email_dailyCampaignCreationTime',
        'email_dailyScheduledSendTime'
      ])

    const settingsMap = (settings || []).reduce((acc, setting) => {
      acc[setting.key] = setting.value
      return acc
    }, {} as Record<string, string>)

    return {
      reviewScheduleEnabled: settingsMap['email_reviewScheduleEnabled'] === 'true',
      dailyScheduleEnabled: settingsMap['email_dailyScheduleEnabled'] === 'true',
      rssProcessingTime: settingsMap['email_rssProcessingTime'] || '20:30',
      campaignCreationTime: settingsMap['email_campaignCreationTime'] || '20:50',
      scheduledSendTime: settingsMap['email_scheduledSendTime'] || '21:00',
      dailyCampaignCreationTime: settingsMap['email_dailyCampaignCreationTime'] || '04:30',
      dailyScheduledSendTime: settingsMap['email_dailyScheduledSendTime'] || '04:55'
    }
  }

  private static getCurrentTimeInCT(): { hours: number, minutes: number, timeString: string } {
    // Get current time in Central Time
    const now = new Date()
    const centralTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}))
    const hours = centralTime.getHours()
    const minutes = centralTime.getMinutes()
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`

    return { hours, minutes, timeString }
  }

  private static parseTime(timeStr: string): { hours: number, minutes: number } {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return { hours, minutes }
  }

  private static isTimeToRun(currentTime: string, scheduledTime: string, lastRunKey: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      const current = this.parseTime(currentTime)
      const scheduled = this.parseTime(scheduledTime)

      // Check if current time matches scheduled time (within 15-minute window)
      const currentMinutes = current.hours * 60 + current.minutes
      const scheduledMinutes = scheduled.hours * 60 + scheduled.minutes
      const timeDiff = Math.abs(currentMinutes - scheduledMinutes)

      if (timeDiff <= 15) {
        // Check if we've already run today for this task
        const today = new Date().toISOString().split('T')[0]
        const { data: lastRun } = await supabaseAdmin
          .from('app_settings')
          .select('value')
          .eq('key', lastRunKey)
          .single()

        const lastRunDate = lastRun?.value || ''

        if (lastRunDate !== today) {
          // Update last run date and return true
          await supabaseAdmin
            .from('app_settings')
            .upsert({
              key: lastRunKey,
              value: today
            }, {
              onConflict: 'key'
            })

          resolve(true)
        } else {
          resolve(false)
        }
      } else {
        resolve(false)
      }
    })
  }

  static async shouldRunRSSProcessing(): Promise<boolean> {
    try {
      const settings = await this.getScheduleSettings()

      if (!settings.reviewScheduleEnabled) {
        return false
      }

      const currentTime = this.getCurrentTimeInCT()
      console.log(`RSS Processing check: Current CT time ${currentTime.timeString}, Scheduled: ${settings.rssProcessingTime}`)

      return await this.isTimeToRun(
        currentTime.timeString,
        settings.rssProcessingTime,
        'last_rss_processing_run'
      )
    } catch (error) {
      console.error('Error checking RSS processing schedule:', error)
      return false
    }
  }

  static async shouldRunCampaignCreation(): Promise<boolean> {
    try {
      const settings = await this.getScheduleSettings()

      if (!settings.reviewScheduleEnabled) {
        return false
      }

      const currentTime = this.getCurrentTimeInCT()
      console.log(`Campaign Creation check: Current CT time ${currentTime.timeString}, Scheduled: ${settings.campaignCreationTime}`)

      return await this.isTimeToRun(
        currentTime.timeString,
        settings.campaignCreationTime,
        'last_campaign_creation_run'
      )
    } catch (error) {
      console.error('Error checking campaign creation schedule:', error)
      return false
    }
  }

  static async shouldRunFinalSend(): Promise<boolean> {
    try {
      const settings = await this.getScheduleSettings()

      if (!settings.dailyScheduleEnabled) {
        return false
      }

      const currentTime = this.getCurrentTimeInCT()
      console.log(`Final Send check: Current CT time ${currentTime.timeString}, Scheduled: ${settings.dailyScheduledSendTime}`)

      return await this.isTimeToRun(
        currentTime.timeString,
        settings.dailyScheduledSendTime,
        'last_final_send_run'
      )
    } catch (error) {
      console.error('Error checking final send schedule:', error)
      return false
    }
  }

  static async shouldRunSubjectGeneration(): Promise<boolean> {
    try {
      const settings = await this.getScheduleSettings()

      if (!settings.reviewScheduleEnabled) {
        return false
      }

      // Subject generation runs 15 minutes after RSS processing
      const rssTime = this.parseTime(settings.rssProcessingTime)
      const subjectTime = {
        hours: rssTime.hours,
        minutes: rssTime.minutes + 15
      }

      // Handle minute overflow
      if (subjectTime.minutes >= 60) {
        subjectTime.hours += 1
        subjectTime.minutes -= 60
      }

      // Handle hour overflow
      if (subjectTime.hours >= 24) {
        subjectTime.hours -= 24
      }

      const subjectTimeString = `${subjectTime.hours.toString().padStart(2, '0')}:${subjectTime.minutes.toString().padStart(2, '0')}`

      const currentTime = this.getCurrentTimeInCT()
      console.log(`Subject Generation check: Current CT time ${currentTime.timeString}, Scheduled: ${subjectTimeString}`)

      return await this.isTimeToRun(
        currentTime.timeString,
        subjectTimeString,
        'last_subject_generation_run'
      )
    } catch (error) {
      console.error('Error checking subject generation schedule:', error)
      return false
    }
  }

  static async getScheduleDisplay(): Promise<{
    rssProcessing: string
    subjectGeneration: string
    campaignCreation: string
    finalSend: string
    reviewEnabled: boolean
    dailyEnabled: boolean
  }> {
    try {
      const settings = await this.getScheduleSettings()

      // Calculate subject generation time (RSS + 15 minutes)
      const rssTime = this.parseTime(settings.rssProcessingTime)
      const subjectTime = {
        hours: rssTime.hours,
        minutes: rssTime.minutes + 15
      }

      if (subjectTime.minutes >= 60) {
        subjectTime.hours += 1
        subjectTime.minutes -= 60
      }
      if (subjectTime.hours >= 24) {
        subjectTime.hours -= 24
      }

      const subjectTimeString = `${subjectTime.hours.toString().padStart(2, '0')}:${subjectTime.minutes.toString().padStart(2, '0')}`

      return {
        rssProcessing: settings.rssProcessingTime,
        subjectGeneration: subjectTimeString,
        campaignCreation: settings.campaignCreationTime,
        finalSend: settings.dailyScheduledSendTime,
        reviewEnabled: settings.reviewScheduleEnabled,
        dailyEnabled: settings.dailyScheduleEnabled
      }
    } catch (error) {
      console.error('Error getting schedule display:', error)
      return {
        rssProcessing: '20:30',
        subjectGeneration: '20:45',
        campaignCreation: '20:50',
        finalSend: '04:55',
        reviewEnabled: false,
        dailyEnabled: false
      }
    }
  }
}