import { supabaseAdmin } from './supabase'
import type { Advertisement } from '@/types/database'

interface ScheduleContext {
  campaignDate: string // YYYY-MM-DD format
  campaignId: string
}

interface ScoredAd extends Advertisement {
  priority_score: number
  reason: string
}

/**
 * Ad Scheduler - Selects which advertisement should appear in a given campaign
 *
 * Priority Logic:
 * 1. Closest to preferred start date (highest priority)
 * 2. Earliest submission date (tiebreaker)
 * 3. Furthest behind schedule (tiebreaker)
 *
 * Frequency Rules:
 * - Single: Can appear any day, only once total
 * - Weekly: Once per Sunday-Saturday week
 * - Monthly: Once per calendar month
 */
export class AdScheduler {
  /**
   * Select the best ad for a given campaign date
   */
  static async selectAdForCampaign(context: ScheduleContext): Promise<Advertisement | null> {
    const { campaignDate, campaignId } = context

    // Get all approved/active ads
    const { data: allAds, error } = await supabaseAdmin
      .from('advertisements')
      .select('*')
      .in('status', ['approved', 'active'])

    if (error || !allAds) {
      console.log('[AdScheduler] Error fetching ads:', error)
      return null
    }

    // Filter to only ads that haven't reached their limit
    const eligibleAds = allAds.filter(ad => ad.times_used < ad.times_paid)

    if (eligibleAds.length === 0) {
      console.log('[AdScheduler] No eligible ads found')
      return null
    }

    // Filter ads based on frequency rules and previous usage
    const qualifiedAds = await this.filterByFrequencyRules(eligibleAds, campaignDate)

    if (qualifiedAds.length === 0) {
      console.log('[AdScheduler] No qualified ads after frequency filtering')
      return null
    }

    // Score each ad based on priority logic
    const scoredAds = this.scoreAds(qualifiedAds, campaignDate)

    // Sort by priority score (highest first)
    scoredAds.sort((a, b) => b.priority_score - a.priority_score)

    const selectedAd = scoredAds[0]

    console.log(`[AdScheduler] Selected ad: ${selectedAd.title}`)
    console.log(`[AdScheduler] Reason: ${selectedAd.reason}`)
    console.log(`[AdScheduler] Priority Score: ${selectedAd.priority_score}`)

    return selectedAd
  }

  /**
   * Filter ads based on frequency rules
   */
  private static async filterByFrequencyRules(
    ads: Advertisement[],
    campaignDate: string
  ): Promise<Advertisement[]> {
    const qualified: Advertisement[] = []

    for (const ad of ads) {
      // Check if ad has already been used today
      const usedToday = await this.wasUsedOnDate(ad.id, campaignDate)
      if (usedToday) {
        continue
      }

      // Check frequency-specific rules
      if (ad.frequency === 'single') {
        // Single ads can appear any day (just not exceed total uses)
        qualified.push(ad)
      } else if (ad.frequency === 'weekly') {
        // Check if used this week (Sunday-Saturday)
        const usedThisWeek = await this.wasUsedThisWeek(ad.id, campaignDate)
        if (!usedThisWeek) {
          qualified.push(ad)
        }
      } else if (ad.frequency === 'monthly') {
        // Check if used this month
        const usedThisMonth = await this.wasUsedThisMonth(ad.id, campaignDate)
        if (!usedThisMonth) {
          qualified.push(ad)
        }
      }
    }

    return qualified
  }

  /**
   * Score ads based on priority logic
   */
  private static scoreAds(ads: Advertisement[], campaignDate: string): ScoredAd[] {
    const campaignTimestamp = new Date(campaignDate).getTime()

    return ads.map(ad => {
      let score = 0
      let reason = ''

      // Priority 1: Closest to preferred start date (weight: 1000)
      if (ad.preferred_start_date) {
        const preferredTimestamp = new Date(ad.preferred_start_date).getTime()
        const daysDiff = Math.abs((campaignTimestamp - preferredTimestamp) / (1000 * 60 * 60 * 24))

        // Closer = higher score (max 1000 points)
        const proximityScore = Math.max(0, 1000 - (daysDiff * 10))
        score += proximityScore

        reason += `Preferred start: ${daysDiff.toFixed(0)} days away (+${proximityScore.toFixed(0)}). `
      }

      // Priority 2: Earliest submission date (weight: 500)
      const submissionTimestamp = new Date(ad.submission_date).getTime()
      const daysSinceSubmission = (campaignTimestamp - submissionTimestamp) / (1000 * 60 * 60 * 24)

      // Older submissions = higher priority (max 500 points)
      const submissionScore = Math.min(500, daysSinceSubmission * 5)
      score += submissionScore

      reason += `Submitted ${daysSinceSubmission.toFixed(0)} days ago (+${submissionScore.toFixed(0)}). `

      // Priority 3: Behind schedule (weight: 300)
      const expectedUsage = this.calculateExpectedUsage(ad, campaignDate)
      const behindBy = expectedUsage - ad.times_used

      if (behindBy > 0) {
        const scheduleScore = Math.min(300, behindBy * 100)
        score += scheduleScore

        reason += `Behind schedule by ${behindBy} (+${scheduleScore.toFixed(0)}).`
      } else {
        reason += 'On track.'
      }

      return {
        ...ad,
        priority_score: score,
        reason
      }
    })
  }

  /**
   * Calculate expected usage by this date based on frequency
   */
  private static calculateExpectedUsage(ad: Advertisement, currentDate: string): number {
    if (!ad.actual_start_date && !ad.preferred_start_date) {
      return 0
    }

    const startDate = ad.actual_start_date || ad.preferred_start_date
    if (!startDate) return 0

    const start = new Date(startDate)
    const current = new Date(currentDate)

    if (current < start) {
      return 0 // Haven't started yet
    }

    const daysSinceStart = Math.floor((current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

    if (ad.frequency === 'single') {
      // For single ads, we expect linear distribution over time
      // If they paid for 5 appearances over 30 days, we expect ~1 every 6 days
      const expectedDaysPerUse = 30 / ad.times_paid // Assume 30-day campaign
      return Math.floor(daysSinceStart / expectedDaysPerUse)
    } else if (ad.frequency === 'weekly') {
      // Expect one use per week
      const weeksSinceStart = Math.floor(daysSinceStart / 7)
      return Math.min(weeksSinceStart, ad.times_paid)
    } else if (ad.frequency === 'monthly') {
      // Expect one use per month
      const monthsSinceStart = Math.floor(daysSinceStart / 30)
      return Math.min(monthsSinceStart, ad.times_paid)
    }

    return 0
  }

  /**
   * Check if ad was used on a specific date
   */
  private static async wasUsedOnDate(adId: string, date: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('campaign_advertisements')
      .select('id')
      .eq('advertisement_id', adId)
      .eq('campaign_date', date)
      .limit(1)

    return (data?.length || 0) > 0
  }

  /**
   * Check if ad was used this week (Sunday-Saturday)
   */
  private static async wasUsedThisWeek(adId: string, date: string): Promise<boolean> {
    const currentDate = new Date(date)
    const dayOfWeek = currentDate.getDay()

    // Get Sunday of this week
    const sunday = new Date(currentDate)
    sunday.setDate(currentDate.getDate() - dayOfWeek)

    // Get Saturday of this week
    const saturday = new Date(sunday)
    saturday.setDate(sunday.getDate() + 6)

    const sundayStr = sunday.toISOString().split('T')[0]
    const saturdayStr = saturday.toISOString().split('T')[0]

    const { data } = await supabaseAdmin
      .from('campaign_advertisements')
      .select('id')
      .eq('advertisement_id', adId)
      .gte('campaign_date', sundayStr)
      .lte('campaign_date', saturdayStr)
      .limit(1)

    return (data?.length || 0) > 0
  }

  /**
   * Check if ad was used this month
   */
  private static async wasUsedThisMonth(adId: string, date: string): Promise<boolean> {
    const currentDate = new Date(date)
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    // First day of month
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0]

    // Last day of month
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0]

    const { data } = await supabaseAdmin
      .from('campaign_advertisements')
      .select('id')
      .eq('advertisement_id', adId)
      .gte('campaign_date', firstDay)
      .lte('campaign_date', lastDay)
      .limit(1)

    return (data?.length || 0) > 0
  }

  /**
   * Record that an ad was used in a campaign
   */
  static async recordAdUsage(
    campaignId: string,
    adId: string,
    campaignDate: string
  ): Promise<void> {
    // Insert into campaign_advertisements
    const { error: insertError } = await supabaseAdmin
      .from('campaign_advertisements')
      .insert({
        campaign_id: campaignId,
        advertisement_id: adId,
        campaign_date: campaignDate,
        used_at: new Date().toISOString()
      })

    if (insertError) {
      console.error('[AdScheduler] Failed to record usage:', insertError)
      throw insertError
    }

    // Increment times_used counter
    const { error: updateError } = await supabaseAdmin.rpc('increment_ad_usage', {
      ad_id: adId
    })

    if (updateError) {
      // Fallback: manual increment
      const { data: ad } = await supabaseAdmin
        .from('advertisements')
        .select('times_used, times_paid')
        .eq('id', adId)
        .single()

      if (ad) {
        const newTimesUsed = ad.times_used + 1
        const newStatus = newTimesUsed >= ad.times_paid ? 'completed' : 'active'

        await supabaseAdmin
          .from('advertisements')
          .update({
            times_used: newTimesUsed,
            status: newStatus,
            last_used_date: campaignDate,
            actual_start_date: ad.times_used === 0 ? campaignDate : undefined
          })
          .eq('id', adId)
      }
    }

    console.log(`[AdScheduler] Recorded usage for ad ${adId} in campaign ${campaignId}`)
  }
}
