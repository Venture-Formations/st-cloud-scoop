'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface Event {
  id: string
  title: string
  description: string
  start_date: string
  end_date: string
  venue: string
  address: string
  url: string | null
  image_url: string | null
  cropped_image_url: string | null
  featured: boolean
  paid_placement: boolean
}

interface Venue {
  name: string
  count: number
}

export default function ViewEventsPage() {
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [selectedVenue, setSelectedVenue] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [pricing, setPricing] = useState({ paidPlacement: 5, featured: 15 })

  useEffect(() => {
    loadEvents()
    loadPricing()
  }, [selectedVenue])

  const loadEvents = async () => {
    try {
      setLoading(true)
      const url = selectedVenue === 'all'
        ? '/api/events/public'
        : `/api/events/public?venue=${encodeURIComponent(selectedVenue)}`

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setEvents(data.events || [])

        // Extract unique venues with counts
        const venueMap = new Map<string, number>()
        data.events.forEach((event: Event) => {
          if (event.venue) {
            venueMap.set(event.venue, (venueMap.get(event.venue) || 0) + 1)
          }
        })

        const venueList = Array.from(venueMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name))

        setVenues(venueList)
      }
    } catch (error) {
      console.error('Failed to load events:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadPricing = async () => {
    try {
      const response = await fetch('/api/settings/public-events')
      if (response.ok) {
        const data = await response.json()
        setPricing({
          paidPlacement: parseFloat(data.paidPlacementPrice),
          featured: parseFloat(data.featuredEventPrice)
        })
      }
    } catch (error) {
      console.error('Failed to load pricing:', error)
    }
  }

  const promoteEvent = (eventId: string) => {
    // Store the event ID in session and redirect to promotion page
    sessionStorage.setItem('promoteEventId', eventId)
    router.push(`/events/promote/${eventId}`)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading events...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Local Events</h1>
          <p className="text-gray-600 mb-4">
            Browse upcoming events in the St. Cloud area. Promote your event to reach more people!
          </p>
          <button
            onClick={() => router.push('/events/submit')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium"
          >
            Submit Your Event
          </button>
        </div>

        {/* Venue Filter */}
        <div className="bg-white shadow rounded-lg p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Venue
          </label>
          <select
            value={selectedVenue}
            onChange={(e) => setSelectedVenue(e.target.value)}
            className="w-full md:w-96 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Venues ({events.length})</option>
            {venues.map(venue => (
              <option key={venue.name} value={venue.name}>
                {venue.name} ({venue.count})
              </option>
            ))}
          </select>
        </div>

        {/* Events Grid */}
        {events.length === 0 ? (
          <div className="bg-white shadow rounded-lg p-12 text-center">
            <p className="text-gray-600 text-lg mb-4">No events found</p>
            <button
              onClick={() => router.push('/events/submit')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium"
            >
              Be the First to Submit
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map(event => (
              <div key={event.id} className="bg-white shadow rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                {/* Featured Badge */}
                {event.featured && (
                  <div className="bg-yellow-400 text-yellow-900 px-4 py-1 text-sm font-medium text-center">
                    ⭐ Featured Event
                  </div>
                )}

                {/* Paid Placement Badge */}
                {event.paid_placement && !event.featured && (
                  <div className="bg-blue-500 text-white px-4 py-1 text-sm font-medium text-center">
                    Sponsored
                  </div>
                )}

                {/* Event Image */}
                {event.cropped_image_url && (
                  <div className="relative h-48 w-full bg-gray-200">
                    <img
                      src={event.cropped_image_url}
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Event Details */}
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                    {event.title}
                  </h3>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-start text-sm text-gray-600">
                      <span className="font-medium mr-2">📅</span>
                      <div>
                        <div>{formatDate(event.start_date)} at {formatTime(event.start_date)}</div>
                        <div className="text-xs">to {formatDate(event.end_date)} at {formatTime(event.end_date)}</div>
                      </div>
                    </div>

                    <div className="flex items-start text-sm text-gray-600">
                      <span className="font-medium mr-2">📍</span>
                      <div>
                        <div className="font-medium">{event.venue}</div>
                        {event.address && (
                          <div className="text-xs text-gray-500">{event.address}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-gray-700 mb-4 line-clamp-3">
                    {event.description}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex space-x-2">
                    {event.url && (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md text-sm font-medium text-center"
                      >
                        Learn More
                      </a>
                    )}
                    {!event.featured && !event.paid_placement && (
                      <button
                        onClick={() => promoteEvent(event.id)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                      >
                        Promote
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Promotion Info */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">Want to Promote Your Event?</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Paid Placement - ${pricing.paidPlacement}</h4>
              <p className="text-sm text-gray-600 mb-2">3-day promotion includes:</p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Featured in paid section of newsletter</li>
                <li>• Reaches thousands of subscribers</li>
                <li>• Increased visibility on website</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Featured Event - ${pricing.featured}</h4>
              <p className="text-sm text-gray-600 mb-2">3-day promotion includes:</p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Premium placement in Local Events section</li>
                <li>• Highlighted with featured badge</li>
                <li>• Maximum visibility and engagement</li>
              </ul>
            </div>
          </div>
          <button
            onClick={() => router.push('/events/submit')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium"
          >
            Submit and Promote Your Event
          </button>
        </div>
      </div>
    </div>
  )
}
