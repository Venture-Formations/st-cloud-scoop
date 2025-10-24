'use client'

import { useState, useEffect } from 'react'
import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, MapPin, ExternalLink } from 'lucide-react'
import NewsletterHeader from '@/components/NewsletterHeader'

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
    content: string
    rss_post?: {
      source_url?: string
      title?: string
    }
  }>
  events?: Array<{
    id: string
    title: string
    description: string | null
    event_summary: string | null
    start_date: string
    end_date: string | null
    venue: string | null
    address: string | null
    url: string | null
    image_url: string | null
    cropped_image_url: string | null
    featured: boolean
  }>
  sections?: {
    road_work?: {
      items: Array<{
        road_name: string
        road_range: string
        city_or_township: string
        reason: string
        start_date: string
        expected_reopen: string
        source_url: string
      }>
      generated_at: string
    }
  }
}

interface PageProps {
  params: Promise<{ date: string }>
}

export default function NewsletterPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    loadNewsletter()
  }, [resolvedParams.date])

  const loadNewsletter = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/newsletters/${resolvedParams.date}`)
      if (response.ok) {
        const data = await response.json()
        if (data.newsletter) {
          setNewsletter(data.newsletter)
        } else {
          setNotFound(true)
        }
      } else if (response.status === 404) {
        setNotFound(true)
      }
    } catch (error) {
      console.error('Failed to load newsletter:', error)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NewsletterHeader currentPage="archive" />

        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading newsletter...</p>
        </div>
      </div>
    )
  }

  if (notFound || !newsletter) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NewsletterHeader currentPage="archive" />

        <div className="py-8 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">Newsletter Not Found</h1>
              <p className="text-gray-600 mb-6">
                The newsletter you're looking for doesn't exist or hasn't been archived yet.
              </p>
              <Link
                href="/newsletter"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium"
              >
                Back to Newsletter Archive
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const articles = newsletter.articles || []
  const events = newsletter.events || []
  const roadWork = newsletter.sections?.road_work

  return (
    <div className="min-h-screen bg-gray-50">
      <NewsletterHeader currentPage="archive" />

      <div className="py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/newsletter"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 mb-6 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Newsletter Archive
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
              {newsletter.subject_line}
            </h1>
            <p className="text-gray-600">{formatDate(newsletter.send_date)}</p>
          </div>

          {/* Articles Section */}
          {articles.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Top Stories</h2>
              <div className="space-y-8">
                {articles.map((article: any, index: number) => (
                  <article key={article.id} className="border-b border-gray-200 last:border-0 pb-8 last:pb-0">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                          {article.headline}
                        </h3>

                        <div className="text-gray-800 leading-relaxed mb-4 whitespace-pre-wrap">
                          {article.content}
                        </div>

                        {article.rss_post?.source_url && (
                          <a
                            href={article.rss_post.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1"
                          >
                            Read full story
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* Events Section */}
          {events.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Upcoming Events</h2>
              <div className="space-y-6">
                {events.map((event: any) => (
                  <div key={event.id} className="border-b border-gray-200 last:border-0 pb-6 last:pb-0">
                    {event.featured && (
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded mb-2">
                        Featured Event
                      </span>
                    )}

                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      {event.title}
                    </h3>

                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <Calendar className="w-4 h-4" />
                      <span>{formatEventDate(event.start_date)}</span>
                    </div>

                    {event.venue && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <MapPin className="w-4 h-4" />
                        <span>{event.venue}{event.address ? `, ${event.address}` : ''}</span>
                      </div>
                    )}

                    <p className="text-gray-800 leading-relaxed mb-3">
                      {event.event_summary || event.description}
                    </p>

                    {event.url && (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1"
                      >
                        Learn more
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Road Work Section */}
          {roadWork && roadWork.items && roadWork.items.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">🚧 Road Work</h2>
              <div className="space-y-3">
                {roadWork.items.map((item: any, index: number) => (
                  <div key={index} className="border-b border-gray-200 last:border-0 pb-3 last:pb-0">
                    <div className="font-bold text-gray-900">
                      {item.road_name} ({item.road_range})
                    </div>
                    <div className="text-gray-800 text-sm mt-1">
                      {item.city_or_township} - {item.reason}
                    </div>
                    {item.expected_reopen && (
                      <div className="text-gray-600 text-xs mt-1">
                        Expected to reopen: {item.expected_reopen}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer CTA */}
          <div className="text-center py-8 border-t border-gray-200 bg-white rounded-xl px-6 mt-8">
            <p className="text-gray-600 mb-4">
              This is an archived edition of the St. Cloud Scoop newsletter.
            </p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/newsletter"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                View All Newsletters
              </Link>
              <span className="text-gray-400">|</span>
              <Link
                href="/events/view"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Browse Events
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
