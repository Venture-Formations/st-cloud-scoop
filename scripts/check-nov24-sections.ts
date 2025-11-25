import { supabaseAdmin as supabase } from '../src/lib/supabase'

const CAMPAIGN_ID = '6d80bdc8-2cb3-4484-9222-487c90dbe76a'
const CAMPAIGN_DATE = '2025-11-24'

async function checkSections() {
  console.log('Checking sections for Nov 24 campaign...\n')

  // Check Poll
  const { data: poll } = await supabase
    .from('polls')
    .select('*')
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('is_active', true)
    .single()
  console.log('Poll:', poll ? 'EXISTS' : 'NONE')
  if (poll) console.log('  Question:', poll.question)

  // Check Weather
  const { data: weather } = await supabase
    .from('weather_data')
    .select('*')
    .eq('campaign_id', CAMPAIGN_ID)
    .single()
  console.log('Weather:', weather ? 'EXISTS' : 'NONE')

  // Check Road Work
  const { data: roadWork } = await supabase
    .from('road_work_data')
    .select('*')
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('is_active', true)
    .single()
  console.log('Road Work:', roadWork ? 'EXISTS' : 'NONE')
  if (roadWork) console.log('  Items:', (roadWork.road_work_data as any[])?.length || 0)

  // Check Dining Deals
  const { data: dining } = await supabase
    .from('campaign_dining_selections')
    .select('*, dining_deal:dining_deals(*)')
    .eq('campaign_id', CAMPAIGN_ID)
  console.log('Dining Deals:', dining && dining.length > 0 ? `EXISTS (${dining.length})` : 'NONE')

  // Check VRBO/Getaways
  const { data: vrbo } = await supabase
    .from('campaign_vrbo_selections')
    .select('*, property:vrbo_properties(*)')
    .eq('campaign_id', CAMPAIGN_ID)
  console.log('Getaways:', vrbo && vrbo.length > 0 ? `EXISTS (${vrbo.length})` : 'NONE')

  // Check Business Spotlight
  const { data: spotlight } = await supabase
    .from('business_spotlights')
    .select('*')
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('is_active', true)
    .single()
  console.log('Business Spotlight:', spotlight ? 'EXISTS' : 'NONE')
  if (spotlight) console.log('  Business:', spotlight.business_name)

  // Check Wordle (yesterday's date)
  const newsletterDate = new Date(CAMPAIGN_DATE + 'T00:00:00')
  const yesterday = new Date(newsletterDate)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayDate = yesterday.toISOString().split('T')[0]

  const { data: wordle } = await supabase
    .from('wordle')
    .select('*')
    .eq('date', yesterdayDate)
    .single()
  console.log('Wordle:', wordle ? 'EXISTS' : 'NONE')
  if (wordle) console.log('  Word:', wordle.word, '(for', yesterdayDate, ')')
}

checkSections().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
