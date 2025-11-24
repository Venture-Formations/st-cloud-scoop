/**
 * Manual script to archive specific campaigns
 * Run with: npx ts-node scripts/archive-campaigns.ts
 */

import { newsletterArchiver } from '../src/lib/newsletter-archiver'
import { supabaseAdmin } from '../src/lib/supabase'

const CAMPAIGNS_TO_ARCHIVE = [
  { id: '07f59631-cd45-45a1-82d9-e16c0d7dd08f', date: '2025-11-23' }, // Nov 23
  { id: '6d80bdc8-2cb3-4484-9222-487c90dbe76a', date: '2025-11-24' }, // Nov 24
]

async function archiveCampaign(campaignId: string, expectedDate: string) {
  console.log(`\n=== Archiving Campaign ${expectedDate} ===`)
  console.log(`Campaign ID: ${campaignId}`)

  try {
    // Fetch campaign data
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select('id, date, subject_line, status')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      console.error('❌ Campaign not found:', campaignError?.message)
      return false
    }

    console.log(`Found campaign: "${campaign.subject_line}"`)
    console.log(`Date: ${campaign.date}, Status: ${campaign.status}`)

    // Check if already archived
    const { data: existing } = await supabaseAdmin
      .from('archived_newsletters')
      .select('id')
      .eq('campaign_id', campaignId)
      .single()

    if (existing) {
      console.log('⚠️  Campaign is already archived')
      return true
    }

    // Archive it
    const result = await newsletterArchiver.archiveNewsletter({
      campaignId: campaign.id,
      campaignDate: campaign.date,
      subjectLine: campaign.subject_line || 'Newsletter',
      recipientCount: 0
    })

    if (result.success) {
      console.log(`✅ Successfully archived! Archive ID: ${result.id}`)
      return true
    } else {
      console.error(`❌ Failed to archive: ${result.error}`)
      return false
    }
  } catch (error) {
    console.error('❌ Error:', error)
    return false
  }
}

async function main() {
  console.log('🗃️  Manual Campaign Archiver')
  console.log(`Archiving ${CAMPAIGNS_TO_ARCHIVE.length} campaigns...`)

  let successCount = 0
  let failCount = 0

  for (const campaign of CAMPAIGNS_TO_ARCHIVE) {
    const success = await archiveCampaign(campaign.id, campaign.date)
    if (success) {
      successCount++
    } else {
      failCount++
    }
  }

  console.log('\n=== Summary ===')
  console.log(`✅ Successful: ${successCount}`)
  console.log(`❌ Failed: ${failCount}`)
  console.log(`📊 Total: ${CAMPAIGNS_TO_ARCHIVE.length}`)
}

main()
  .then(() => {
    console.log('\n✨ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error)
    process.exit(1)
  })
