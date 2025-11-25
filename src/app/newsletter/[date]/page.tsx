'use client'

import { useState, useEffect } from 'react'
import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, MapPin, ExternalLink } from 'lucide-react'
import NewsletterHeader from '@/components/NewsletterHeader'
import Image from 'next/image'

interface Newsletter {
  id: string
  campaign_date: string
  subject_line: string
  send_date: string
  metadata?: {
    total_articles?: number
    total_events?: number
    has_wordle?: boolean
    has_poll?: boolean
    has_getaways?: boolean
    has_dining_deals?: boolean
    has_weather?: boolean
    has_road_work?: boolean
    has_business_spotlight?: boolean
  }
  articles?: Array<{
    id: string
    headline: string
    content: string
    image_url?: string
    rss_post?: {
      source_url?: string
      title?: string
      image_url?: string
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
    wordle?: {
      word: string
      definition: string
      interesting_fact: string
    }
    poll?: {
      id: string
      question: string
      option_a: string
      option_b: string
      option_c: string
      option_d: string
    }
    weather?: {
      html: string
      forecast_date: string
    }
    minnesota_getaways?: {
      properties: Array<{
        id: string
        title: string
        city: string
        state: string
        bedrooms: number
        bathrooms: number
        sleeps: number
        main_image_url: string
        adjusted_image_url: string
        link: string
      }>
    }
    dining_deals?: {
      deals: Array<{
        id: string
        business_name: string
        business_address: string | null
        google_profile: string | null
        special_description: string
        special_time: string | null
        day_of_week: string
      }>
    }
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
    business_spotlight?: {
      id: string
      business_name: string
      description: string
      image_url: string
      website_url: string
      contact_email: string
      contact_phone: string
      address: string
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
      month: 'short',
      day: 'numeric'
    })
  }

  const formatEventTime = (startDate: string, endDate: string | null) => {
    const start = new Date(startDate)
    const end = endDate ? new Date(endDate) : null

    const formatTime = (date: Date) => {
      let hours = date.getHours()
      const minutes = date.getMinutes()
      const ampm = hours >= 12 ? 'PM' : 'AM'
      hours = hours % 12 || 12
      const minuteStr = minutes === 0 ? '' : `:${minutes.toString().padStart(2, '0')}`
      return `${hours}${minuteStr}${ampm}`
    }

    if (end) {
      return `${formatTime(start)} - ${formatTime(end)}`
    }
    return formatTime(start)
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
  const sections = newsletter.sections || {}

  // Group events by date
  const eventsByDate: Record<string, typeof events> = {}
  events.forEach(event => {
    const dateKey = event.start_date.split('T')[0]
    if (!eventsByDate[dateKey]) {
      eventsByDate[dateKey] = []
    }
    eventsByDate[dateKey].push(event)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <NewsletterHeader currentPage="archive" />

      <div className="py-8 px-4">
        <div className="max-w-5xl mx-auto">
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

          {/* The Local Scoop - Top Stories */}
          {articles.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-[#1877F2] mb-6">The Local Scoop</h2>
              <div className="space-y-8">
                {articles.map((article: any, index: number) => {
                  const articleImage = article.image_url || article.rss_post?.image_url

                  return (
                    <article key={article.id} className="border-b border-gray-200 last:border-0 pb-8 last:pb-0">
                      <div className="flex items-start gap-6">
                        <div className="flex-1">
                          <div className="flex items-start gap-4 mb-3">
                            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                              {index + 1}
                            </div>
                            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 flex-1">
                              {article.headline}
                            </h3>
                          </div>

                          <div className="text-gray-800 leading-relaxed mb-4 whitespace-pre-wrap ml-12">
                            {article.content}
                          </div>

                          {article.rss_post?.source_url && (
                            <div className="ml-12">
                              <a
                                href={article.rss_post.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1"
                              >
                                Read full story
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                          )}
                        </div>

                        {articleImage && (
                          <div className="flex-shrink-0 w-48 h-32 relative rounded-lg overflow-hidden hidden md:block">
                            <Image
                              src={articleImage}
                              alt={article.headline}
                              fill
                              className="object-cover"
                            />
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          )}

          {/* Local Events */}
          {events.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-[#1877F2] mb-6">Local Events</h2>

              {Object.entries(eventsByDate).map(([date, dayEvents]) => (
                <div key={date} className="mb-8 last:mb-0">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    {formatDate(date + 'T00:00:00')}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {dayEvents.map((event: any) => (
                      <div
                        key={event.id}
                        className={`rounded-lg p-4 hover:shadow-md transition-shadow ${
                          event.featured
                            ? 'border-2 border-blue-500 bg-blue-50'
                            : 'border border-gray-200'
                        }`}
                      >
                        {event.cropped_image_url || event.image_url ? (
                          <div className="w-full h-32 relative rounded-lg overflow-hidden mb-3">
                            <Image
                              src={event.cropped_image_url || event.image_url}
                              alt={event.title}
                              fill
                              className="object-cover"
                            />
                          </div>
                        ) : null}

                        <h4 className="font-bold text-gray-900 mb-2 line-clamp-2">
                          {event.title}
                        </h4>

                        <div className="text-sm text-gray-600 mb-2">
                          {formatEventTime(event.start_date, event.end_date)}
                        </div>

                        {event.venue && (
                          <div className="text-sm text-gray-600 mb-2 line-clamp-1">
                            📍 {event.venue}
                          </div>
                        )}

                        <p className="text-sm text-gray-700 leading-relaxed mb-3 line-clamp-3">
                          {event.event_summary || event.description}
                        </p>

                        <Link
                          href={`/events/${event.id}`}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1"
                        >
                          Learn more
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Poll Section */}
          {sections.poll && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-[#1877F2] mb-6">Poll</h2>
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="font-bold text-gray-900 mb-4">{sections.poll.question}</h3>
                <div className="space-y-2">
                  {sections.poll.option_a && (
                    <div className="bg-white border border-gray-200 rounded p-3 text-gray-800">
                      A) {sections.poll.option_a}
                    </div>
                  )}
                  {sections.poll.option_b && (
                    <div className="bg-white border border-gray-200 rounded p-3 text-gray-800">
                      B) {sections.poll.option_b}
                    </div>
                  )}
                  {sections.poll.option_c && (
                    <div className="bg-white border border-gray-200 rounded p-3 text-gray-800">
                      C) {sections.poll.option_c}
                    </div>
                  )}
                  {sections.poll.option_d && (
                    <div className="bg-white border border-gray-200 rounded p-3 text-gray-800">
                      D) {sections.poll.option_d}
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-4 italic">Poll results were available to newsletter subscribers.</p>
              </div>
            </div>
          )}

          {/* Local Weather */}
          {sections.weather && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-[#1877F2] mb-6">Local Weather</h2>
              <div dangerouslySetInnerHTML={{ __html: sections.weather.html }} />
            </div>
          )}

          {/* Yesterday's Wordle */}
          {sections.wordle && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-[#1877F2] mb-6">Yesterday's Wordle</h2>
              <div className="bg-[#F8F9FA] rounded-lg p-6">
                <div className="text-center mb-4">
                  <div className="text-3xl font-bold text-gray-900 uppercase tracking-wider">
                    {sections.wordle.word}
                  </div>
                </div>
                <div className="space-y-3 text-gray-800">
                  <div>
                    <strong>Definition:</strong> {sections.wordle.definition}
                  </div>
                  <div>
                    <strong>Interesting Fact:</strong> {sections.wordle.interesting_fact}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Minnesota Getaways */}
          {sections.minnesota_getaways && sections.minnesota_getaways.properties.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-[#1877F2] mb-6">Minnesota Getaways</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sections.minnesota_getaways.properties.map((property: any) => (
                  <div key={property.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                    {property.adjusted_image_url || property.main_image_url ? (
                      <div className="w-full h-48 relative">
                        <Image
                          src={property.adjusted_image_url || property.main_image_url}
                          alt={property.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : null}
                    <div className="p-4">
                      <h3 className="font-bold text-gray-900 mb-2">{property.title}</h3>
                      <p className="text-sm text-gray-600 mb-3">
                        {property.city}, {property.state}
                      </p>
                      <div className="text-sm text-gray-700 mb-3">
                        🛏️ {property.bedrooms} bed · 🛁 {property.bathrooms} bath · 👥 Sleeps {property.sleeps}
                      </div>
                      {property.link && (
                        <a
                          href={property.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1"
                        >
                          View property
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dining Deals */}
          {sections.dining_deals && sections.dining_deals.deals.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-[#1877F2] mb-6">Dining Deals</h2>
              <div className="space-y-4">
                {sections.dining_deals.deals.map((deal: any) => (
                  <div key={deal.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 mb-1">{deal.business_name}</h3>
                      {deal.business_address && (
                        <p className="text-sm text-gray-600 mb-2">
                          {deal.business_address}
                        </p>
                      )}
                      <p className="text-gray-800 mb-2">{deal.special_description}</p>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-blue-600 font-medium">{deal.day_of_week}</span>
                        {deal.special_time && (
                          <>
                            <span className="text-gray-400">·</span>
                            <span className="text-gray-600">{deal.special_time}</span>
                          </>
                        )}
                      </div>
                      {deal.google_profile && (
                        <a
                          href={deal.google_profile}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1 mt-2"
                        >
                          View on Google Maps
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Road Work */}
          {sections.road_work && sections.road_work.items && sections.road_work.items.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-[#1877F2] mb-6">🚧 Road Work</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sections.road_work.items.map((item: any, index: number) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="font-bold text-gray-900 mb-2">
                      {item.road_name}
                    </div>
                    <div className="text-sm text-gray-600 mb-1">
                      {item.road_range}
                    </div>
                    <div className="text-sm text-gray-700 mb-2">
                      {item.city_or_township}
                    </div>
                    <div className="text-sm text-gray-800 mb-2">
                      {item.reason}
                    </div>
                    {item.expected_reopen && (
                      <div className="text-xs text-gray-600">
                        Expected: {item.expected_reopen}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Community Business Spotlight */}
          {sections.business_spotlight && (
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6 border border-gray-200">
              <h2 className="text-2xl font-bold text-[#1877F2] mb-6">Community Business Spotlight</h2>
              <div className="border border-gray-200 rounded-lg p-6">
                {sections.business_spotlight.image_url && (
                  <div className="w-full h-48 relative rounded-lg overflow-hidden mb-4">
                    <Image
                      src={sections.business_spotlight.image_url}
                      alt={sections.business_spotlight.business_name}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {sections.business_spotlight.business_name}
                </h3>
                <p className="text-gray-800 leading-relaxed mb-4">
                  {sections.business_spotlight.description}
                </p>
                <div className="space-y-2 text-sm text-gray-700">
                  {sections.business_spotlight.address && (
                    <div>📍 {sections.business_spotlight.address}</div>
                  )}
                  {sections.business_spotlight.contact_phone && (
                    <div>📞 {sections.business_spotlight.contact_phone}</div>
                  )}
                  {sections.business_spotlight.contact_email && (
                    <div>✉️ {sections.business_spotlight.contact_email}</div>
                  )}
                </div>
                {sections.business_spotlight.website_url && (
                  <a
                    href={sections.business_spotlight.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1 mt-4"
                  >
                    Visit website
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
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
