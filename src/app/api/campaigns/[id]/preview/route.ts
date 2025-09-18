import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch campaign with active articles
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select(`
        *,
        articles:newsletter_articles(
          id,
          headline,
          content,
          word_count,
          image_url,
          image_alt_text,
          is_active,
          rss_post:rss_posts(
            source_url,
            rss_feed:rss_feeds(name)
          )
        )
      `)
      .eq('id', id)
      .single()

    if (campaignError) {
      console.error('Campaign fetch error:', campaignError)
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Filter to only active articles
    if (campaign.articles) {
      campaign.articles = campaign.articles.filter((article: any) => article.is_active)
    }

    // Generate HTML newsletter
    const newsletterHtml = generateNewsletterHtml(campaign)

    return NextResponse.json({
      success: true,
      campaign,
      html: newsletterHtml
    })

  } catch (error) {
    console.error('Preview generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate newsletter preview' },
      { status: 500 }
    )
  }
}

function generateNewsletterHtml(campaign: any): string {
  const articles = campaign.articles || []
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return `
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
      <div class="date">${formatDate(campaign.date)}</div>
    </div>

    ${articles.map((article: any) => `
      <div class="article">
        <h2 class="article-headline">${article.headline}</h2>
        ${article.image_url ? `
          <img src="${article.image_url}" alt="${article.image_alt_text || ''}" class="article-image">
        ` : ''}
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
}