import { supabaseAdmin } from '@/lib/supabase'

export interface DiningSelection {
  deals: any[]
  message: string
}

export async function selectDiningDealsForCampaign(campaignId: string, campaignDate: Date): Promise<DiningSelection> {
  try {
    // Get the day of the week for the campaign date
    const dayOfWeek = campaignDate.toLocaleDateString('en-US', { weekday: 'long' })

    // Get all active deals for this day of the week
    const { data: availableDeals, error: dealsError } = await supabaseAdmin
      .from('dining_deals')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
      .order('is_featured', { ascending: false }) // Featured deals first
      .order('business_name', { ascending: true }) // Then alphabetical

    if (dealsError) {
      console.error('Error fetching dining deals:', dealsError)
      throw new Error('Failed to fetch dining deals')
    }

    if (!availableDeals || availableDeals.length === 0) {
      return {
        deals: [],
        message: `No active dining deals found for ${dayOfWeek}`
      }
    }

    // Check if we already have selections for this campaign
    const { data: existingSelections, error: selectionsError } = await supabaseAdmin
      .from('campaign_dining_selections')
      .select('*')
      .eq('campaign_id', campaignId)

    if (selectionsError) {
      console.error('Error checking existing dining selections:', selectionsError)
      throw new Error('Failed to check existing dining selections')
    }

    if (existingSelections && existingSelections.length > 0) {
      // Get the deal details for existing selections
      const dealIds = existingSelections.map(s => s.deal_id)
      const { data: selectedDeals, error: selectedError } = await supabaseAdmin
        .from('dining_deals')
        .select('*')
        .in('id', dealIds)
        .order('is_featured', { ascending: false })
        .order('business_name', { ascending: true })

      if (selectedError) {
        console.error('Error fetching selected deals:', selectedError)
        throw new Error('Failed to fetch selected deals')
      }

      return {
        deals: selectedDeals || [],
        message: `Using existing ${selectedDeals?.length || 0} dining deals for ${dayOfWeek}`
      }
    }

    // Select up to 8 deals with featured prioritization
    const selectedDeals = availableDeals.slice(0, 8)

    // If no deals are featured, mark the first one as featured
    if (selectedDeals.length > 0 && !selectedDeals.some(deal => deal.is_featured)) {
      // Update the first deal to be featured (temporarily for this campaign)
      const firstDeal = selectedDeals[0]
      firstDeal.is_featured = true
    }

    // Insert campaign selections with proper ordering
    const campaignSelections = selectedDeals.map((deal, index) => ({
      campaign_id: campaignId,
      deal_id: deal.id,
      selection_order: index + 1,
      is_featured_in_campaign: deal.is_featured
    }))

    const { error: insertError } = await supabaseAdmin
      .from('campaign_dining_selections')
      .insert(campaignSelections)

    if (insertError) {
      console.error('Error inserting dining selections:', insertError)
      throw new Error('Failed to save dining selections')
    }

    return {
      deals: selectedDeals,
      message: `Selected ${selectedDeals.length} dining deals for ${dayOfWeek} (${selectedDeals.filter(d => d.is_featured).length} featured)`
    }

  } catch (error) {
    console.error('Error in selectDiningDealsForCampaign:', error)
    return {
      deals: [],
      message: `Error selecting dining deals: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

export async function getDiningDealsForCampaign(campaignId: string): Promise<any[]> {
  try {
    const { data: selections, error: selectionsError } = await supabaseAdmin
      .from('campaign_dining_selections')
      .select(`
        *,
        dining_deal:dining_deals(*)
      `)
      .eq('campaign_id', campaignId)
      .order('selection_order', { ascending: true })

    if (selectionsError) {
      console.error('Error fetching campaign dining selections:', selectionsError)
      return []
    }

    if (!selections || selections.length === 0) {
      return []
    }

    // Extract deals and preserve the selection order
    const deals = selections
      .map(s => ({
        ...s.dining_deal,
        is_featured_in_campaign: s.is_featured_in_campaign,
        selection_order: s.selection_order
      }))

    return deals
  } catch (error) {
    console.error('Error in getDiningDealsForCampaign:', error)
    return []
  }
}