'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import type { EmailMetrics, NewsletterCampaign } from '@/types/database'

interface CampaignWithMetrics extends NewsletterCampaign {
  email_metrics?: EmailMetrics
}

export default function AnalyticsPage() {
  const [campaigns, setCampaigns] = useState<CampaignWithMetrics[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState('30')

  useEffect(() => {
    fetchAnalytics()
  }, [selectedTimeframe])

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(`/api/campaigns?limit=50&status=sent`)
      if (!response.ok) {
        throw new Error('Failed to fetch analytics data')
      }
      const data = await response.json()
      setCampaigns(data.campaigns)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const refreshMetrics = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/analytics/${campaignId}`, {
        method: 'POST'
      })
      if (response.ok) {
        fetchAnalytics() // Refresh the data
      }
    } catch (error) {
      console.error('Failed to refresh metrics:', error)
    }
  }

  const calculateAverages = () => {
    const campaignsWithMetrics = campaigns.filter(c => c.email_metrics)
    if (campaignsWithMetrics.length === 0) return null

    const totals = campaignsWithMetrics.reduce((acc, campaign) => {
      const metrics = campaign.email_metrics!
      return {
        sent: acc.sent + metrics.sent_count,
        delivered: acc.delivered + metrics.delivered_count,
        opened: acc.opened + metrics.opened_count,
        clicked: acc.clicked + metrics.clicked_count,
        bounced: acc.bounced + metrics.bounced_count,
        unsubscribed: acc.unsubscribed + metrics.unsubscribed_count,
      }
    }, { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 })

    return {
      avgOpenRate: totals.delivered > 0 ? (totals.opened / totals.delivered) * 100 : 0,
      avgClickRate: totals.delivered > 0 ? (totals.clicked / totals.delivered) * 100 : 0,
      avgBounceRate: totals.sent > 0 ? (totals.bounced / totals.sent) * 100 : 0,
      avgUnsubscribeRate: totals.delivered > 0 ? (totals.unsubscribed / totals.delivered) * 100 : 0,
      totalSent: totals.sent,
      totalDelivered: totals.delivered,
      totalOpened: totals.opened,
      totalClicked: totals.clicked,
      campaignCount: campaignsWithMetrics.length
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  const formatPercentage = (value: number | null | undefined) => {
    if (value == null) return 'N/A'
    return `${(value * 100).toFixed(1)}%`
  }

  const averages = calculateAverages()

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Newsletter Analytics
            </h1>
            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <div className="text-red-600 mb-4">Error: {error}</div>
            <button
              onClick={fetchAnalytics}
              className="text-brand-primary hover:text-blue-700"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            {averages && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="text-2xl font-bold text-green-600 mb-1">
                    {averages.avgOpenRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">Average Open Rate</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {averages.totalOpened.toLocaleString()} total opens
                  </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="text-2xl font-bold text-blue-600 mb-1">
                    {averages.avgClickRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">Average Click Rate</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {averages.totalClicked.toLocaleString()} total clicks
                  </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="text-2xl font-bold text-gray-600 mb-1">
                    {averages.totalSent.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">Total Sent</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {averages.campaignCount} campaigns
                  </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="text-2xl font-bold text-yellow-600 mb-1">
                    {averages.avgBounceRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">Average Bounce Rate</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {averages.totalDelivered.toLocaleString()} delivered
                  </div>
                </div>
              </div>
            )}

            {/* Campaign Performance Table */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">
                  Campaign Performance
                </h2>
                <p className="text-sm text-gray-600">
                  Detailed metrics for each sent newsletter
                </p>
              </div>

              {campaigns.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No sent campaigns found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Subject Line
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sent
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Open Rate
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Click Rate
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {campaigns.map((campaign) => (
                        <tr key={campaign.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatDate(campaign.date)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                            {campaign.subject_line || (
                              <span className="italic text-gray-400">No subject</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {campaign.email_metrics?.sent_count?.toLocaleString() || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className={`font-medium ${
                              (campaign.email_metrics?.open_rate || 0) > 0.25 ? 'text-green-600' :
                              (campaign.email_metrics?.open_rate || 0) > 0.15 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {formatPercentage(campaign.email_metrics?.open_rate)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className={`font-medium ${
                              (campaign.email_metrics?.click_rate || 0) > 0.05 ? 'text-green-600' :
                              (campaign.email_metrics?.click_rate || 0) > 0.02 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {formatPercentage(campaign.email_metrics?.click_rate)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => refreshMetrics(campaign.id)}
                              className="text-brand-primary hover:text-blue-700 mr-3"
                            >
                              Refresh
                            </button>
                            <a
                              href={`/dashboard/campaigns/${campaign.id}`}
                              className="text-gray-600 hover:text-gray-900"
                            >
                              View
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Performance Insights */}
            {averages && (
              <div className="mt-8 bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Performance Insights
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Benchmarks</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Newsletter industry avg open rate:</span>
                        <span className="font-medium">21.3%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Newsletter industry avg click rate:</span>
                        <span className="font-medium">2.6%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Your average open rate:</span>
                        <span className={`font-medium ${
                          averages.avgOpenRate > 21.3 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {averages.avgOpenRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Your average click rate:</span>
                        <span className={`font-medium ${
                          averages.avgClickRate > 2.6 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {averages.avgClickRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Recommendations</h4>
                    <div className="space-y-2 text-sm text-gray-600">
                      {averages.avgOpenRate < 20 && (
                        <div>• Consider testing different subject line styles</div>
                      )}
                      {averages.avgClickRate < 2 && (
                        <div>• Try including more compelling calls-to-action</div>
                      )}
                      {averages.avgBounceRate > 5 && (
                        <div>• Review and clean your subscriber list</div>
                      )}
                      {averages.avgOpenRate > 25 && (
                        <div>• Great open rates! Your subject lines are working well</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}