import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    console.log('Preview API called')
    const { id } = await props.params
    console.log('Campaign ID:', id)

    const session = await getServerSession(authOptions)
    console.log('Session check:', !!session?.user?.email)

    if (!session?.user?.email) {
      console.log('Authorization failed - no session')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Fetching campaign with ID:', id)
    // Fetch campaign with active articles
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select(`
        *,
        articles(
          id,
          headline,
          content,
          word_count,
          fact_check_score,
          is_active,
          rss_post:rss_posts(
            source_url,
            rss_feed:rss_feeds(name)
          )
        )
      `)
      .eq('id', id)
      .single()

    console.log('Campaign query result:', { campaign: !!campaign, error: campaignError })

    if (campaignError) {
      console.error('Campaign fetch error:', campaignError)
      return NextResponse.json({ error: `Campaign fetch failed: ${campaignError.message}` }, { status: 404 })
    }

    if (!campaign) {
      console.log('No campaign found')
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    console.log('Campaign found, articles count:', campaign.articles?.length || 0)

    // Filter to only active articles
    if (campaign.articles) {
      const beforeFilter = campaign.articles.length
      campaign.articles = campaign.articles.filter((article: any) => article.is_active)
      console.log('Active articles after filter:', campaign.articles.length, 'from', beforeFilter)
    }

    console.log('Generating HTML newsletter')
    // Generate HTML newsletter
    const newsletterHtml = generateNewsletterHtml(campaign)
    console.log('HTML generated, length:', newsletterHtml.length)

    return NextResponse.json({
      success: true,
      campaign,
      html: newsletterHtml
    })

  } catch (error) {
    console.error('Preview generation error:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      { error: `Failed to generate newsletter preview: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

function generateNewsletterHtml(campaign: any): string {
  try {
    console.log('Generating HTML for campaign:', campaign?.id)
    const articles = campaign.articles || []
    console.log('Articles to render:', articles.length)

    const formatDate = (dateString: string) => {
      try {
        return new Date(dateString).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      } catch (e) {
        console.error('Date formatting error:', e)
        return dateString
      }
    }

    const formattedDate = formatDate(campaign.date)
    console.log('Formatted date:', formattedDate)

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>St. Cloud Scoop - ${formatDate(campaign.date)}</title>
  <style>
    body {
      font-family: Georgia, 'Times New Roman', serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f8f9fa;
    }
    .container {
      background-color: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 2.2em;
      font-weight: bold;
      color: #2563eb;
      margin-bottom: 5px;
    }
    .tagline {
      font-style: italic;
      color: #666;
      font-size: 1.1em;
    }
    .date {
      color: #666;
      margin-top: 10px;
      font-size: 0.9em;
    }
    .article {
      margin-bottom: 25px;
      padding-bottom: 20px;
      border-bottom: 1px solid #eee;
    }
    .article:last-child {
      border-bottom: none;
    }
    .article-headline {
      font-size: 1.3em;
      font-weight: bold;
      color: #1f2937;
      margin-bottom: 10px;
      line-height: 1.3;
    }
    .article-content {
      color: #4b5563;
      margin-bottom: 10px;
    }
    .article-meta {
      font-size: 0.85em;
      color: #6b7280;
      font-style: italic;
    }
    .article-image {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 10px 0;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 0.9em;
    }
    .footer a {
      color: #2563eb;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">St. Cloud Scoop</div>
      <div class="tagline">Your Local News Connection</div>
      <div class="date">${formattedDate}</div>
    </div>

    ${articles.map((article: any) => `
      <div class="article">
        <h2 class="article-headline">${article.headline}</h2>
        <div class="article-content">${article.content}</div>
        <div class="article-meta">
          Source: ${article.rss_post?.rss_feed?.name || 'Unknown'} • ${article.word_count} words
          ${article.rss_post?.source_url ? ` • <a href="${article.rss_post.source_url}" target="_blank">Read more</a>` : ''}
        </div>
      </div>
    `).join('')}

    <div class="footer">
      <p>
        📧 St. Cloud Scoop Newsletter<br>
        Keeping St. Cloud connected to what matters most.
      </p>
      <p>
        <a href="#">Unsubscribe</a> • <a href="#">Update Preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()

    console.log('HTML template generated successfully, length:', html.length)
    return html

  } catch (error) {
    console.error('HTML generation error:', error)
    throw new Error(`HTML generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}