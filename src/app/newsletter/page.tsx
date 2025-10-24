'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import NewsletterHeader from '@/components/NewsletterHeader'

const NEWSLETTERS_PER_PAGE = 6

interface Newsletter {
  id: string
  campaign_date: string
  subject_line: string
  send_date: string
  metadata?: {
    total_articles?: number
    total_events?: number
    has_road_work?: boolean
  }
  articles?: Array<{
    id: string
    headline: string
    rss_post?: {
      image_url?: string
      title?: string
    }
  }>
  events?: Array<{
    image_url?: string
    cropped_image_url?: string
  }>
}

export default function NewslettersPage() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    loadNewsletters()
  }, [])

  const loadNewsletters = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/newsletters/archived')
      if (response.ok) {
        const data = await response.json()
        setNewsletters(data.newsletters || [])
      }
    } catch (error) {
      console.error('Failed to load newsletters:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calculate pagination
  const totalPages = Math.ceil(newsletters.length / NEWSLETTERS_PER_PAGE)
  const startIndex = (currentPage - 1) * NEWSLETTERS_PER_PAGE
  const endIndex = startIndex + NEWSLETTERS_PER_PAGE
  const currentNewsletters = newsletters.slice(startIndex, endIndex)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getNewsletterImage = (newsletter: Newsletter) => {
    // Try to get image from first article
    const firstArticle = newsletter.articles?.[0]
    if (firstArticle?.rss_post?.image_url) {
      return firstArticle.rss_post.image_url
    }

    // Try to get image from first event
    const firstEvent = newsletter.events?.[0]
    if (firstEvent?.cropped_image_url) {
      return firstEvent.cropped_image_url
    }
    if (firstEvent?.image_url) {
      return firstEvent.image_url
    }

    // Default placeholder
    return 'https://raw.githubusercontent.com/VFDavid/STCScoop/refs/heads/main/STCSCOOP_Logo_824X148_clear.png'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NewsletterHeader currentPage="archive" />

      <div className="py-8 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Newsletter Archive</h1>
            <p className="text-gray-600">
              Browse past editions of the St. Cloud Scoop newsletter
            </p>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading newsletters...</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && newsletters.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No Newsletters Archived Yet
              </h3>
              <p className="text-gray-600 mb-6">
                Past newsletter editions will appear here once they are sent.
              </p>
              <Link
                href="/events/view"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
              >
                Browse Events
              </Link>
            </div>
          )}

          {/* Newsletter Grid */}
          {!loading && newsletters.length > 0 && (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {currentNewsletters.map((newsletter) => {
                  const metadata = newsletter.metadata || {}
                  const totalArticles = metadata.total_articles || 0
                  const totalEvents = metadata.total_events || 0

                  return (
                    <Link key={newsletter.id} href={`/newsletter/${newsletter.campaign_date}`}>
                      <div className="group cursor-pointer hover:shadow-lg transition-shadow bg-white border border-gray-200 rounded-lg overflow-hidden h-full flex flex-col">
                        {/* Image */}
                        <div className="relative w-full h-48 bg-gray-100 overflow-hidden">
                          <img
                            src={getNewsletterImage(newsletter)}
                            alt={newsletter.subject_line}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              e.currentTarget.src = 'https://raw.githubusercontent.com/VFDavid/STCScoop/refs/heads/main/STCSCOOP_Logo_824X148_clear.png'
                            }}
                          />
                        </div>

                        {/* Content */}
                        <div className="px-4 pt-4 pb-4 flex-1 flex flex-col">
                          <div className="flex items-center gap-2 text-xs text-gray-600 mb-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatDate(newsletter.send_date)}</span>
                          </div>

                          <h3 className="text-base font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors leading-tight flex-1">
                            {newsletter.subject_line}
                          </h3>

                          {/* Content Stats */}
                          <div className="flex items-center gap-3 text-xs text-gray-700 flex-wrap">
                            {totalArticles > 0 && (
                              <span className="flex items-center gap-1">
                                📰 {totalArticles} {totalArticles === 1 ? 'article' : 'articles'}
                              </span>
                            )}
                            {totalEvents > 0 && (
                              <span className="flex items-center gap-1">
                                📅 {totalEvents} {totalEvents === 1 ? 'event' : 'events'}
                              </span>
                            )}
                            {metadata.has_road_work && (
                              <span>🚧 Road Work</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-10">
                  <button
                    className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(1)}
                  >
                    First
                  </button>
                  <button
                    className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>

                  <div className="flex items-center gap-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        className={`w-10 h-10 rounded-lg ${
                          currentPage === page
                            ? "bg-blue-600 text-white"
                            : "text-gray-900 hover:bg-gray-100"
                        }`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    className="text-sm text-gray-900 hover:text-gray-600 px-3 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    className="text-sm text-gray-900 hover:text-gray-600 px-3 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                  >
                    Last
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
