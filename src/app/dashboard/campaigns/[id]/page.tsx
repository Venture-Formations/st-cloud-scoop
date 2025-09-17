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
                disabled={saving}
                className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-800 px-4 py-2 rounded text-sm font-medium"
              >
                Preview Newsletter
              </button>
              <button
                disabled={saving}
                className="bg-brand-primary hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
              >
                Send for Review
              </button>
            </div>
          </div>

          {campaign.subject_line && (
            <div className="mt-4 p-3 bg-gray-50 rounded">
              <div className="text-sm text-gray-600 mb-1">Subject Line:</div>
              <div className="font-medium">{campaign.subject_line}</div>
            </div>
          )}
        </div>

        {/* Articles Section */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">
              Articles ({campaign.articles.length})
            </h2>
            <p className="text-sm text-gray-600">
              Toggle articles on/off for the newsletter. Articles are ranked by AI evaluation.
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {campaign.articles.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No articles generated yet. Run RSS processing to generate articles.
              </div>
            ) : (
              campaign.articles
                .sort((a, b) => (b.rss_post?.post_rating?.total_score || 0) - (a.rss_post?.post_rating?.total_score || 0))
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
                          {article.rss_post?.post_rating && (
                            <div className="flex space-x-1 text-xs">
                              <span className={`font-medium ${getScoreColor(article.rss_post.post_rating.total_score)}`}>
                                Score: {article.rss_post.post_rating.total_score}/30
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

                        {article.rss_post?.post_rating && (
                          <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
                            <div>
                              <span className="text-gray-600">Interest:</span>
                              <span className="ml-1 font-medium">{article.rss_post.post_rating.interest_level}/10</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Relevance:</span>
                              <span className="ml-1 font-medium">{article.rss_post.post_rating.local_relevance}/10</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Impact:</span>
                              <span className="ml-1 font-medium">{article.rss_post.post_rating.community_impact}/10</span>
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
      </div>
    </Layout>
  )
}