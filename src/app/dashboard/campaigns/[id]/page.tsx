'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Layout from '@/components/Layout'
import type { CampaignWithArticles, ArticleWithPost } from '@/types/database'

export default function CampaignDetailPage() {
  const params = useParams()
  const [campaign, setCampaign] = useState<CampaignWithArticles | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [sendingReview, setSendingReview] = useState(false)
  const [generatingSubject, setGeneratingSubject] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchCampaign(params.id as string)
    }
  }, [params.id])

  const fetchCampaign = async (id: string) => {
    try {
      const response = await fetch(`/api/campaigns/${id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch campaign')
      }
      const data = await response.json()
      setCampaign(data.campaign)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const toggleArticle = async (articleId: string, currentState: boolean) => {
    if (!campaign) return

    // Prevent selecting a 6th article - simply return without action
    if (!currentState) { // currentState is false means we're trying to activate
      const activeCount = campaign.articles.filter(article => article.is_active).length
      if (activeCount >= 5) {
        return // No action taken, no alert - just prevent the selection
      }
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/articles`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          article_updates: [{
            article_id: articleId,
            is_active: !currentState
          }]
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update article')
      }

      // Update local state
      setCampaign(prev => {
        if (!prev) return prev
        return {
          ...prev,
          articles: prev.articles.map(article =>
            article.id === articleId
              ? { ...article, is_active: !currentState }
              : article
          )
        }
      })

    } catch (error) {
      alert('Failed to update article: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const previewNewsletter = async () => {
    if (!campaign) return

    try {
      console.log('Calling preview API for campaign:', campaign.id)
      const response = await fetch(`/api/campaigns/${campaign.id}/preview`)
      console.log('Preview API response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const errorMessage = errorData?.error || `HTTP ${response.status}: ${response.statusText}`
        console.error('Preview API error:', errorMessage)
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('Preview data received:', !!data.html, 'HTML length:', data.html?.length)
      setPreviewHtml(data.html)
      setShowPreview(true)
    } catch (error) {
      console.error('Preview error:', error)
      alert('Failed to generate preview: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const processRSSFeeds = async () => {
    if (!campaign) return

    setProcessing(true)
    setProcessingStatus('Initializing RSS processing...')

    try {
      // Start the processing
      setProcessingStatus('Fetching RSS feeds...')

      // Start processing in the background
      const processPromise = fetch('/api/rss/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign_id: campaign.id
        })
      })

      // Poll for status updates while processing
      const statusInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/rss/status/${campaign.id}`)
          if (statusResponse.ok) {
            const statusData = await statusResponse.json()

            if (statusData.counts.posts > 0) {
              setProcessingStatus(`Found ${statusData.counts.posts} posts, evaluating with AI...`)
            }

            if (statusData.counts.articles > 0) {
              setProcessingStatus(`Generated ${statusData.counts.articles} articles, finalizing...`)
            }
          }
        } catch (error) {
          // Silent fail for status updates
        }
      }, 2000)

      // Wait for processing to complete
      const response = await processPromise
      clearInterval(statusInterval)

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to process RSS feeds')
      }

      setProcessingStatus('Processing complete! Refreshing articles...')

      // Refresh the campaign data to show new articles
      await fetchCampaign(campaign.id)

      setProcessingStatus('Done!')
      setTimeout(() => setProcessingStatus(''), 2000)
    } catch (error) {
      setProcessingStatus('')
      alert('Failed to process RSS feeds: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setProcessing(false)
    }
  }

  const sendForReview = async () => {
    if (!campaign) return

    // Check if there are any active articles
    const activeArticles = campaign.articles.filter(article => article.is_active)
    if (activeArticles.length === 0) {
      alert('Please select at least one article before sending for review.')
      return
    }

    setSendingReview(true)
    try {
      // First, generate subject line with AI if not already set
      let subjectLine = campaign.subject_line
      console.log('Current campaign subject line:', subjectLine)

      if (!subjectLine || subjectLine.trim() === '') {
        console.log('Generating AI subject line...')
        const subjectResponse = await fetch(`/api/campaigns/${campaign.id}/generate-subject`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        })

        if (subjectResponse.ok) {
          const subjectData = await subjectResponse.json()
          subjectLine = subjectData.subject_line

          console.log('AI generated subject line:', subjectLine)

          // Update campaign locally with new subject line
          setCampaign(prev => {
            if (!prev) return prev
            return {
              ...prev,
              subject_line: subjectLine
            }
          })
        } else {
          const errorData = await subjectResponse.json().catch(() => null)
          console.error('Failed to generate subject line:', subjectResponse.status, errorData)
          alert(`Warning: Could not generate AI subject line. Error: ${errorData?.error || 'Unknown error'}. Proceeding with default subject.`)
        }
      } else {
        console.log('Skipping AI generation - subject line already exists:', subjectLine)
      }

      // Now send for review
      const response = await fetch(`/api/campaigns/${campaign.id}/send-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send review')
      }

      const data = await response.json()

      // Update campaign status locally
      setCampaign(prev => {
        if (!prev) return prev
        return {
          ...prev,
          status: 'in_review'
        }
      })

      alert('Newsletter sent for review successfully!')

    } catch (error) {
      alert('Failed to send for review: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setSendingReview(false)
    }
  }

  const generateSubjectLine = async () => {
    if (!campaign) return

    // Check if there are any active articles
    const activeArticles = campaign.articles.filter(article => article.is_active)
    if (activeArticles.length === 0) {
      alert('Please select at least one article before generating a subject line.')
      return
    }

    setGeneratingSubject(true)
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/generate-subject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate subject line')
      }

      const data = await response.json()

      // Update campaign locally with new subject line
      setCampaign(prev => {
        if (!prev) return prev
        return {
          ...prev,
          subject_line: data.subject_line
        }
      })

      console.log(`Generated subject line: "${data.subject_line}" (${data.character_count} characters)`)

    } catch (error) {
      alert('Failed to generate subject line: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setGeneratingSubject(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 25) return 'text-green-600'
    if (score >= 20) return 'text-yellow-600'
    return 'text-red-600'
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
        </div>
      </Layout>
    )
  }

  if (error || !campaign) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="text-red-600 mb-4">
            {error || 'Campaign not found'}
          </div>
          <a href="/dashboard/campaigns" className="text-brand-primary hover:text-blue-700">
            Back to Campaigns
          </a>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        {/* Campaign Header */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Newsletter for {formatDate(campaign.date)}
              </h1>
              <div className="flex items-center space-x-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  campaign.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                  campaign.status === 'in_review' ? 'bg-yellow-100 text-yellow-800' :
                  campaign.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                  campaign.status === 'sent' ? 'bg-green-100 text-green-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {campaign.status.replace('_', ' ')}
                </span>
                <span className="text-sm text-gray-500">
                  {campaign.articles.length} articles selected
                </span>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={processRSSFeeds}
                disabled={processing || saving || sendingReview || generatingSubject}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
              >
                {processing ? 'Processing...' : 'Process RSS Feeds'}
              </button>
              <button
                onClick={previewNewsletter}
                disabled={saving || sendingReview || generatingSubject}
                className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-800 px-4 py-2 rounded text-sm font-medium"
              >
                Preview Newsletter
              </button>
              <button
                onClick={sendForReview}
                disabled={saving || sendingReview || generatingSubject || campaign.status === 'sent' || campaign.status === 'approved'}
                className="bg-brand-primary hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
              >
                {sendingReview ? (generatingSubject ? 'Generating Subject...' : 'Sending...') : 'Send for Review'}
              </button>
            </div>
          </div>

          {processingStatus && (
            <div className="text-sm text-blue-600 font-medium mt-3 text-center">
              {processingStatus}
            </div>
          )}

          {/* Subject Line Section */}
          <div className="mt-4 p-3 bg-gray-50 rounded">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="text-sm text-gray-600 mb-1">Subject Line:</div>
                {campaign.subject_line ? (
                  <div className="font-medium text-gray-900">{campaign.subject_line}</div>
                ) : (
                  <div className="text-gray-500 italic">No subject line generated yet</div>
                )}
              </div>
              <button
                onClick={generateSubjectLine}
                disabled={generatingSubject || processing || sendingReview}
                className="ml-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-3 py-1 rounded text-sm font-medium"
              >
                {generatingSubject ? 'Generating...' : campaign.subject_line ? 'Regenerate' : 'Generate'}
              </button>
            </div>
          </div>
        </div>

        {/* Articles Section */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">
              Articles ({campaign.articles.length})
            </h2>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Toggle articles on/off for the newsletter. Articles are ranked by AI evaluation.
              </p>
              <div className="text-sm">
                <span className={`font-medium ${campaign.articles.filter(a => a.is_active).length === 5 ? 'text-green-600' : 'text-yellow-600'}`}>
                  {campaign.articles.filter(a => a.is_active).length}/5 selected
                </span>
                <span className="text-gray-500 ml-1">for newsletter</span>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {campaign.articles.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <p className="mb-4">No articles generated yet. Run RSS processing to generate articles.</p>
                <button
                  onClick={processRSSFeeds}
                  disabled={processing}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
                >
                  {processing ? 'Processing...' : 'Process RSS Feeds'}
                </button>
              </div>
            ) : (
              campaign.articles
                .sort((a, b) => (b.rss_post?.post_rating?.[0]?.total_score || 0) - (a.rss_post?.post_rating?.[0]?.total_score || 0))
                .map((article) => (
                  <div key={article.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <button
                            onClick={() => toggleArticle(article.id, article.is_active)}
                            disabled={saving}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              article.is_active
                                ? 'bg-brand-primary border-brand-primary text-white'
                                : 'border-gray-300 hover:border-gray-400'
                            } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {article.is_active && (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                          <h3 className="text-lg font-medium text-gray-900">
                            {article.headline}
                          </h3>
                          {article.rss_post?.post_rating?.[0] && (
                            <div className="flex space-x-1 text-xs">
                              <span className={`font-medium ${getScoreColor(article.rss_post.post_rating[0].total_score)}`}>
                                Score: {article.rss_post.post_rating[0].total_score}/30
                              </span>
                            </div>
                          )}
                        </div>

                        <p className="text-gray-700 mb-3">
                          {article.content}
                        </p>

                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <div className="flex items-center space-x-4">
                            <span>Source: {article.rss_post?.rss_feed?.name}</span>
                            <span>{article.word_count} words</span>
                            {article.fact_check_score && (
                              <span className={getScoreColor(article.fact_check_score)}>
                                Fact-check: {article.fact_check_score}/30
                              </span>
                            )}
                          </div>
                          {article.rss_post?.source_url && (
                            <a
                              href={article.rss_post.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-primary hover:text-blue-700"
                            >
                              View Original
                            </a>
                          )}
                        </div>

                        {article.rss_post?.post_rating?.[0] && (
                          <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
                            <div>
                              <span className="text-gray-600">Interest:</span>
                              <span className="ml-1 font-medium">{article.rss_post.post_rating[0].interest_level}/10</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Relevance:</span>
                              <span className="ml-1 font-medium">{article.rss_post.post_rating[0].local_relevance}/10</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Impact:</span>
                              <span className="ml-1 font-medium">{article.rss_post.post_rating[0].community_impact}/10</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex justify-between items-center p-4 border-b">
                <h3 className="text-lg font-medium text-gray-900">
                  Newsletter Preview
                </h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      if (previewHtml) {
                        const blob = new Blob([previewHtml], { type: 'text/html' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `newsletter-${campaign?.date}.html`
                        a.click()
                        URL.revokeObjectURL(url)
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Download HTML
                  </button>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {previewHtml && (
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-full min-h-[600px]"
                    title="Newsletter Preview"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}