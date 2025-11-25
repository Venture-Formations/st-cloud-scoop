// Script to restore articles from archived newsletter data
// Run with: npx tsx scripts/restore-articles.ts

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const CAMPAIGN_ID = '2db92515-a2b9-419c-810d-8a339940affc'

// Articles from the archived newsletter
const archivedArticles = [
  {
    id: 'b31793c6-db0f-4d8c-890d-a830ad930009',
    campaign_id: CAMPAIGN_ID,
    headline: 'Discover Enchanting Christmas Tree Farms Near St. Cloud',
    content: 'Experience the holiday magic with the scent of fresh pine, snowy paths, and the quest for the ideal festive tree. St. Cloud offers picturesque Christmas tree farms close by, perfect for starting new traditions or continuing old ones. Enjoy horse-drawn rides and warm cider by the fire at nearby locations, including B&J Evergreen, Hinkemeyer, Jan\'s, and Petersen farms.',
    word_count: 57,
    rank: 1,
    final_position: 1,
    is_active: true,
    skipped: false
  },
  {
    id: '8e7c9ca2-df8f-4c21-b571-1c889c355618',
    campaign_id: CAMPAIGN_ID,
    headline: 'Stearns County Offices to Close for Holiday Observance',
    content: 'Stearns County will temporarily shut its offices on Thursday and Friday in recognition of Thanksgiving. Normal operations will recommence on the following Monday. Residents are encouraged to enjoy a safe and happy holiday with loved ones.',
    word_count: 40,
    rank: 2,
    final_position: 2,
    is_active: true,
    skipped: false
  },
  {
    id: 'a6570bbb-837d-4b4a-8252-de41a4904f6f',
    campaign_id: CAMPAIGN_ID,
    headline: 'Firefighters Rally Community Support for Muscular Dystrophy',
    content: 'The community is invited to Cooper Coborn\'s for the first of a three-day event supporting the Muscular Dystrophy Association. Attendees can meet local firefighters, view a fire truck, and contribute to the Fill the Boot campaign. The event coincides with Thanksgiving preparations, offering a chance to shop while supporting local families affected by muscular dystrophy.',
    word_count: 55,
    rank: 3,
    final_position: 3,
    is_active: true,
    skipped: false
  },
  {
    id: 'd5d8b51e-47e1-456d-a94e-23766ded6e48',
    campaign_id: CAMPAIGN_ID,
    headline: 'Support Available for Those Affected by Suicide',
    content: 'For individuals mourning a loved one lost to suicide, resources are available to provide support during this difficult time. Information about obtaining a suicide bereavement packet can offer guidance and help those affected navigate their grief. This initiative emphasizes that no one has to face this journey alone, exploring the available support systems for those in need.',
    word_count: 54,
    rank: 4,
    final_position: 4,
    is_active: true,
    skipped: false
  },
  {
    id: '9447e083-23c8-42c3-b0b6-a06969d4b8b3',
    campaign_id: CAMPAIGN_ID,
    headline: 'Young Students Craft Comfort Items for Community Aid',
    content: 'Clearview Elementary\'s fourth-grade students, alongside parents and guardians, organized a service event to create tie blankets and placements. This initiative aimed to support individuals needing assistance during the holiday season, reflecting the community\'s spirit of giving and collaboration.',
    word_count: 40,
    rank: 5,
    final_position: 5,
    is_active: true,
    skipped: false
  }
]

async function restoreArticles() {
  console.log('Starting article restoration...')
  console.log(`Campaign ID: ${CAMPAIGN_ID}`)
  console.log(`Articles to restore: ${archivedArticles.length}`)

  for (const article of archivedArticles) {
    console.log(`\nRestoring: ${article.headline}`)

    // Use upsert to either insert or update
    const { data, error } = await supabase
      .from('articles')
      .upsert(article, { onConflict: 'id' })
      .select()

    if (error) {
      console.error(`  ERROR: ${error.message}`)
    } else {
      console.log(`  SUCCESS: Article restored`)
    }
  }

  console.log('\n=== Restoration Complete ===')

  // Verify
  const { data: restored, error: verifyError } = await supabase
    .from('articles')
    .select('id, headline, rank, is_active')
    .eq('campaign_id', CAMPAIGN_ID)
    .order('rank', { ascending: true })

  if (verifyError) {
    console.error('Verification error:', verifyError)
  } else {
    console.log(`\nVerification - ${restored?.length || 0} articles in campaign:`)
    restored?.forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.headline} (rank: ${a.rank}, active: ${a.is_active})`)
    })
  }
}

restoreArticles().catch(console.error)
