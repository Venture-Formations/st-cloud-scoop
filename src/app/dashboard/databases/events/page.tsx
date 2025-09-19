'use client'

import { useEffect, useState, useMemo } from 'react'
import Layout from '@/components/Layout'
import Link from 'next/link'
import { Event } from '@/types/database'

type SortField = 'title' | 'start_date' | 'venue' | 'featured' | 'created_at'
type SortDirection = 'asc' | 'desc'

interface EventsFilter {
  search: string
  featured: 'all' | 'true' | 'false'
  dateRange: 'all' | 'upcoming' | 'past'
}

interface ColumnConfig {
  key: keyof Event
  label: string
  visible: boolean
  sortable: boolean
}

export default function EventsDatabasePage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('start_date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [filter, setFilter] = useState<EventsFilter>({
    search: '',
    featured: 'all',
    dateRange: 'all'
  })
  const [showAddForm, setShowAddForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [columns, setColumns] = useState<ColumnConfig[]>([
    { key: 'title', label: 'Title', visible: true, sortable: true },
    { key: 'start_date', label: 'Start Date', visible: true, sortable: true },
    { key: 'end_date', label: 'End Date', visible: false, sortable: true },
    { key: 'venue', label: 'Venue', visible: true, sortable: true },
    { key: 'address', label: 'Address', visible: false, sortable: false },
    { key: 'featured', label: 'Featured', visible: true, sortable: true },
    { key: 'url', label: 'URL', visible: false, sortable: false },
    { key: 'created_at', label: 'Created', visible: true, sortable: true }
  ])

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events')
      if (response.ok) {
        const data = await response.json()
        setEvents(data.events || [])
      }
    } catch (error) {
      console.error('Failed to fetch events:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredAndSortedEvents = useMemo(() => {
    let filtered = events.filter(event => {
      const matchesSearch = event.title.toLowerCase().includes(filter.search.toLowerCase()) ||
                           (event.venue && event.venue.toLowerCase().includes(filter.search.toLowerCase()))

      const matchesFeatured = filter.featured === 'all' ||
                             (filter.featured === 'true' && event.featured) ||
                             (filter.featured === 'false' && !event.featured)

      let matchesDate = true
      if (filter.dateRange === 'upcoming') {
        matchesDate = new Date(event.start_date) >= new Date()
      } else if (filter.dateRange === 'past') {
        matchesDate = new Date(event.start_date) < new Date()
      }

      return matchesSearch && matchesFeatured && matchesDate
    })

    filtered.sort((a, b) => {
      let aValue = a[sortField]
      let bValue = b[sortField]

      if (sortField === 'start_date' || sortField === 'created_at') {
        aValue = new Date(aValue as string).getTime()
        bValue = new Date(bValue as string).getTime()
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase()
        bValue = (bValue as string).toLowerCase()
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [events, filter, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const toggleColumn = (key: keyof Event) => {
    setColumns(prev => prev.map(col =>
      col.key === key ? { ...col, visible: !col.visible } : col
    ))
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const visibleColumns = columns.filter(col => col.visible)

  const handleAddEvent = async (eventData: any) => {
    setSubmitting(true)
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventData)
      })

      if (response.ok) {
        setShowAddForm(false)
        fetchEvents() // Refresh the events list
      } else {
        const error = await response.json()
        console.error('Failed to add event:', error)
        alert('Failed to add event: ' + (error.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error adding event:', error)
      alert('Failed to add event')
    } finally {
      setSubmitting(false)
    }
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

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        <div className="flex justify-between items-center mb-6">
          <div>
            <nav className="flex" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2">
                <li>
                  <Link href="/dashboard/databases" className="text-gray-500 hover:text-gray-700">
                    Databases
                  </Link>
                </li>
                <li>
                  <span className="text-gray-500">/</span>
                </li>
                <li>
                  <span className="text-gray-900 font-medium">Local Events</span>
                </li>
              </ol>
            </nav>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">
              Local Events Database
            </h1>
            <p className="text-gray-600">
              {events.length} total events • {filteredAndSortedEvents.length} shown
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-brand-primary text-white px-4 py-2 rounded-lg hover:bg-brand-primary/90 font-medium"
          >
            Add Event
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                value={filter.search}
                onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
                placeholder="Search title or venue..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Featured
              </label>
              <select
                value={filter.featured}
                onChange={(e) => setFilter(prev => ({ ...prev, featured: e.target.value as 'all' | 'true' | 'false' }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="all">All Events</option>
                <option value="true">Featured Only</option>
                <option value="false">Not Featured</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date Range
              </label>
              <select
                value={filter.dateRange}
                onChange={(e) => setFilter(prev => ({ ...prev, dateRange: e.target.value as 'all' | 'upcoming' | 'past' }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="all">All Dates</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Columns
              </label>
              <div className="relative">
                <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                  <option>Manage Columns</option>
                </select>
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-10 hidden">
                  {columns.map(col => (
                    <label key={col.key} className="flex items-center px-3 py-2 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={col.visible}
                        onChange={() => toggleColumn(col.key)}
                        className="mr-2"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Events Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {visibleColumns.map(col => (
                    <th
                      key={col.key}
                      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                        col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                      }`}
                      onClick={() => col.sortable && handleSort(col.key as SortField)}
                    >
                      <div className="flex items-center">
                        {col.label}
                        {col.sortable && sortField === col.key && (
                          <span className="ml-1">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAndSortedEvents.map(event => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    {visibleColumns.map(col => (
                      <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {col.key === 'featured' ? (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            event.featured ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {event.featured ? 'Featured' : 'Standard'}
                          </span>
                        ) : col.key === 'start_date' || col.key === 'end_date' || col.key === 'created_at' ? (
                          event[col.key] ? formatDate(event[col.key] as string) : '-'
                        ) : col.key === 'url' ? (
                          event.url ? (
                            <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
                              View
                            </a>
                          ) : '-'
                        ) : (
                          event[col.key] || '-'
                        )}
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button className="text-brand-primary hover:text-brand-primary/80">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredAndSortedEvents.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-200 rounded-lg mx-auto mb-4 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3a4 4 0 118 0v4m-4 8h0m0 0v4a4 4 0 01-8 0v-4h8z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No events found
            </h3>
            <p className="text-gray-500">
              Try adjusting your filters or add a new event.
            </p>
          </div>
        )}

        {/* Add Event Modal */}
        {showAddForm && (
          <AddEventModal
            onClose={() => setShowAddForm(false)}
            onSubmit={handleAddEvent}
            submitting={submitting}
          />
        )}
      </div>
    </Layout>
  )
}

function AddEventModal({
  onClose,
  onSubmit,
  submitting
}: {
  onClose: () => void
  onSubmit: (data: any) => void
  submitting: boolean
}) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    venue: '',
    address: '',
    url: '',
    image_url: '',
    featured: false
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Add New Event</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={submitting}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date *
              </label>
              <input
                type="datetime-local"
                required
                value={formData.start_date}
                onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="datetime-local"
                value={formData.end_date}
                onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                disabled={submitting}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Venue
            </label>
            <input
              type="text"
              value={formData.venue}
              onChange={(e) => setFormData(prev => ({ ...prev, venue: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Event URL
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Image URL
            </label>
            <input
              type="url"
              value={formData.image_url}
              onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.featured}
                onChange={(e) => setFormData(prev => ({ ...prev, featured: e.target.checked }))}
                className="mr-2"
                disabled={submitting}
              />
              <span className="text-sm font-medium text-gray-700">Featured Event</span>
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-primary/90 disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? 'Adding...' : 'Add Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}