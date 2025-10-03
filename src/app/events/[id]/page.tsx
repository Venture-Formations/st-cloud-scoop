'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

interface Event {
  id: string
  title: string
  description: string | null
  event_summary: string | null
  start_date: string
  end_date: string | null
  venue: string | null
  address: string | null
  url: string | null
  website: string | null
  image_url: string | null
  original_image_url: string | null
  cropped_image_url: string | null
  featured: boolean
  paid_placement: boolean
}

export default function EventPage() {
  const params = useParams()
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (params.id) {
      fetchEvent(params.id as string)
    }
  }, [params.id])

  const fetchEvent = async (id: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/events/${id}`)

      if (!response.ok) {
        if (response.status === 404) {
          setError('Event not found')
        } else {
          throw new Error('Failed to fetch event')
        }
        return
      }

      const data = await response.json()
      setEvent(data.event)
    } catch (err) {
      console.error('Error fetching event:', err)
      setError('Failed to load event')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (startDate: string, endDate: string | null) => {
    const start = new Date(startDate)
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago'
    }

    if (!endDate || startDate === endDate) {
      return start.toLocaleDateString('en-US', options)
    }

    const end = new Date(endDate)
    const startFormatted = start.toLocaleDateString('en-US', options)
    const endFormatted = end.toLocaleDateString('en-US', options)

    // If same day, just show different times
    if (start.toDateString() === end.toDateString()) {
      return `${startFormatted} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })}`
    }

    return `${startFormatted} - ${endFormatted}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {error || 'Event Not Found'}
          </h1>
          <Link
            href="/events/view"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            ← Back to Events
          </Link>
        </div>
      </div>
    )
  }

  const displayImage = event.cropped_image_url || event.image_url || event.original_image_url

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/events/view"
            className="text-blue-600 hover:text-blue-800 font-medium flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Events
          </Link>
        </div>
      </div>

      {/* Event Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Event Image */}
          {displayImage && (
            <div className="relative h-96 w-full">
              <Image
                src={displayImage}
                alt={event.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          )}

          {/* Event Details */}
          <div className="p-6 sm:p-8">
            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              {event.featured && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                  ⭐ Featured
                </span>
              )}
              {event.paid_placement && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  Sponsored
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              {event.title}
            </h1>

            {/* Date/Time */}
            <div className="flex items-start mb-6 text-gray-700">
              <svg className="w-6 h-6 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <p className="font-medium text-lg">{formatDate(event.start_date, event.end_date)}</p>
              </div>
            </div>

            {/* Venue */}
            {event.venue && (
              <div className="flex items-start mb-6 text-gray-700">
                <svg className="w-6 h-6 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="font-medium text-lg">{event.venue}</p>
                  {event.address && <p className="text-gray-600">{event.address}</p>}
                </div>
              </div>
            )}

            {/* Description */}
            {(event.event_summary || event.description) && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">About This Event</h2>
                <div className="prose max-w-none text-gray-700">
                  <p>{event.event_summary || event.description}</p>
                </div>
              </div>
            )}

            {/* Website Button */}
            {event.website && (
              <div className="mt-8">
                <a
                  href={event.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Visit Event Website
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Submit Your Event CTA */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Have an Event?</h3>
          <p className="text-gray-600 mb-4">Submit your event to be featured in our newsletter!</p>
          <Link
            href="/events/submit"
            className="inline-flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Submit Your Event
          </Link>
        </div>
      </div>
    </div>
  )
}
