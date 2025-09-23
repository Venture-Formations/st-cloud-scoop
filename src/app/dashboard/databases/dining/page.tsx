'use client'

import { useEffect, useState, useMemo } from 'react'
import Layout from '@/components/Layout'
import Link from 'next/link'
import { DiningDeal } from '@/types/database'

type SortField = 'business_name' | 'day_of_week' | 'special_description' | 'is_featured' | 'created_at'
type SortDirection = 'asc' | 'desc'

interface DiningFilter {
  search: string
  day_of_week: 'all' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
  featured: 'all' | 'true' | 'false'
  active: 'all' | 'true' | 'false'
}

interface ColumnConfig {
  key: keyof DiningDeal
  label: string
  visible: boolean
  sortable: boolean
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function DiningDatabasePage() {
  const [deals, setDeals] = useState<DiningDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [filter, setFilter] = useState<DiningFilter>({
    search: '',
    day_of_week: 'all',
    featured: 'all',
    active: 'all'
  })
  const [showAddForm, setShowAddForm] = useState(false)
  const [showCsvUpload, setShowCsvUpload] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingDeal, setEditingDeal] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<DiningDeal>>({})
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [columns, setColumns] = useState<ColumnConfig[]>([
    { key: 'business_name', label: 'Business', visible: true, sortable: true },
    { key: 'day_of_week', label: 'Day', visible: true, sortable: true },
    { key: 'special_description', label: 'Special', visible: true, sortable: true },
    { key: 'special_time', label: 'Time', visible: true, sortable: false },
    { key: 'business_address', label: 'Address', visible: false, sortable: false },
    { key: 'google_profile', label: 'Google Profile', visible: false, sortable: false },
    { key: 'is_featured', label: 'Featured', visible: true, sortable: true },
    { key: 'is_active', label: 'Active', visible: true, sortable: true },
    { key: 'created_at', label: 'Created', visible: false, sortable: true }
  ])

  useEffect(() => {
    fetchDeals()
  }, [])

  const fetchDeals = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/dining/deals')
      if (response.ok) {
        const data = await response.json()
        setDeals(data.deals || [])
      } else {
        console.error('Failed to fetch deals')
      }
    } catch (error) {
      console.error('Error fetching deals:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredAndSortedDeals = useMemo(() => {
    let filtered = deals.filter(deal => {
      const matchesSearch = !filter.search ||
        deal.business_name.toLowerCase().includes(filter.search.toLowerCase()) ||
        deal.special_description.toLowerCase().includes(filter.search.toLowerCase())

      const matchesDay = filter.day_of_week === 'all' || deal.day_of_week === filter.day_of_week
      const matchesFeatured = filter.featured === 'all' ||
        (filter.featured === 'true') === deal.is_featured
      const matchesActive = filter.active === 'all' ||
        (filter.active === 'true') === deal.is_active

      return matchesSearch && matchesDay && matchesFeatured && matchesActive
    })

    return filtered.sort((a, b) => {
      let aVal = a[sortField as keyof DiningDeal]
      let bVal = b[sortField as keyof DiningDeal]

      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return sortDirection === 'asc' ? 1 : -1
      if (bVal == null) return sortDirection === 'asc' ? -1 : 1

      // Special handling for day_of_week sorting
      if (sortField === 'day_of_week') {
        const aIndex = DAYS_OF_WEEK.indexOf(aVal as string)
        const bIndex = DAYS_OF_WEEK.indexOf(bVal as string)
        const result = aIndex - bIndex
        return sortDirection === 'asc' ? result : -result
      }

      // Convert to strings for comparison
      aVal = String(aVal)
      bVal = String(bVal)

      const result = aVal.localeCompare(bVal, undefined, { numeric: true })
      return sortDirection === 'asc' ? result : -result
    })
  }, [deals, filter, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleEdit = (deal: DiningDeal) => {
    setEditingDeal(deal.id)
    setEditData({
      business_name: deal.business_name,
      business_address: deal.business_address,
      google_profile: deal.google_profile,
      day_of_week: deal.day_of_week,
      special_description: deal.special_description,
      special_time: deal.special_time,
      is_featured: deal.is_featured,
      is_active: deal.is_active
    })
  }

  const handleSaveEdit = async () => {
    if (!editingDeal) return

    try {
      setUpdating(true)
      const response = await fetch(`/api/dining/deals/${editingDeal}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      })

      if (response.ok) {
        await fetchDeals()
        setEditingDeal(null)
        setEditData({})
      } else {
        console.error('Failed to update deal')
      }
    } catch (error) {
      console.error('Error updating deal:', error)
    } finally {
      setUpdating(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingDeal(null)
    setEditData({})
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this dining deal?')) return

    try {
      setDeleting(id)
      const response = await fetch(`/api/dining/deals/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchDeals()
      } else {
        console.error('Failed to delete deal')
      }
    } catch (error) {
      console.error('Error deleting deal:', error)
    } finally {
      setDeleting(null)
    }
  }

  const visibleColumns = columns.filter(col => col.visible)

  // Calculate statistics by day
  const statsByDay = DAYS_OF_WEEK.reduce((acc, day) => {
    const dayDeals = deals.filter(d => d.day_of_week === day && d.is_active)
    acc[day] = {
      total: dayDeals.length,
      featured: dayDeals.filter(d => d.is_featured).length
    }
    return acc
  }, {} as { [key: string]: { total: number; featured: number } })

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
        {/* Header */}
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Dining Deals
            </h1>
            <p className="text-gray-600">
              Manage restaurant specials organized by day of the week for newsletter campaigns.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowCsvUpload(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Upload CSV
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-brand-primary hover:bg-brand-dark text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Add Deal
            </button>
          </div>
        </div>

        {/* Stats by Day */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {DAYS_OF_WEEK.map(day => (
            <div key={day} className="bg-white p-3 rounded-lg shadow text-center">
              <div className="text-sm font-medium text-gray-600 mb-1">{day.slice(0, 3)}</div>
              <div className="text-xl font-bold text-brand-primary">{statsByDay[day]?.total || 0}</div>
              <div className="text-xs text-gray-500">
                {statsByDay[day]?.featured || 0} featured
              </div>
            </div>
          ))}
        </div>

        {/* Overall Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-brand-primary">{deals.length}</div>
            <div className="text-sm text-gray-600">Total Deals</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">
              {deals.filter(d => d.is_active).length}
            </div>
            <div className="text-sm text-gray-600">Active Deals</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-yellow-600">
              {deals.filter(d => d.is_featured && d.is_active).length}
            </div>
            <div className="text-sm text-gray-600">Featured Deals</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-purple-600">
              {new Set(deals.filter(d => d.is_active).map(d => d.business_name)).size}
            </div>
            <div className="text-sm text-gray-600">Unique Businesses</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                value={filter.search}
                onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
                placeholder="Search business or special..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Day of Week
              </label>
              <select
                value={filter.day_of_week}
                onChange={(e) => setFilter(prev => ({ ...prev, day_of_week: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Days</option>
                {DAYS_OF_WEEK.map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Featured
              </label>
              <select
                value={filter.featured}
                onChange={(e) => setFilter(prev => ({ ...prev, featured: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All</option>
                <option value="true">Featured</option>
                <option value="false">Not Featured</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filter.active}
                onChange={(e) => setFilter(prev => ({ ...prev, active: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilter({ search: '', day_of_week: 'all', featured: 'all', active: 'all' })}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md text-sm transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-gray-600">
            Showing {filteredAndSortedDeals.length} of {deals.length} deals
          </div>
        </div>

        {/* Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {visibleColumns.map((column) => (
                    <th
                      key={column.key}
                      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                        column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                      }`}
                      onClick={() => column.sortable && handleSort(column.key as SortField)}
                    >
                      <div className="flex items-center space-x-1">
                        <span>{column.label}</span>
                        {column.sortable && sortField === column.key && (
                          <span className="text-brand-primary">
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
                {filteredAndSortedDeals.map((deal) => (
                  <tr key={deal.id} className="hover:bg-gray-50">
                    {visibleColumns.map((column) => (
                      <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm">
                        {editingDeal === deal.id ? (
                          // Edit mode
                          <EditCell
                            column={column}
                            value={editData[column.key]}
                            onChange={(value) => setEditData(prev => ({ ...prev, [column.key]: value }))}
                          />
                        ) : (
                          // Display mode
                          <DisplayCell column={column} deal={deal} />
                        )}
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingDeal === deal.id ? (
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={updating}
                            className="text-green-600 hover:text-green-900 disabled:opacity-50"
                          >
                            {updating ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(deal)}
                            className="text-brand-primary hover:text-brand-dark"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(deal.id)}
                            disabled={deleting === deal.id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            {deleting === deal.id ? '...' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredAndSortedDeals.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-500 text-sm">
                {deals.length === 0 ? 'No dining deals found. Add your first deal above.' : 'No deals match your current filters.'}
              </div>
            </div>
          )}
        </div>

        {/* Add Form Modal */}
        {showAddForm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Dining Deal</h3>
                <AddDealForm onClose={() => setShowAddForm(false)} onSuccess={fetchDeals} />
              </div>
            </div>
          </div>
        )}

        {/* CSV Upload Modal */}
        {showCsvUpload && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Upload Dining Deals CSV</h3>
                <CsvUploadForm onClose={() => setShowCsvUpload(false)} onSuccess={fetchDeals} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

// Component for displaying cell values
function DisplayCell({ column, deal }: { column: ColumnConfig; deal: DiningDeal }) {
  const value = deal[column.key]

  switch (column.key) {
    case 'is_featured':
      return (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          value ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
        }`}>
          {value ? 'Featured' : 'Regular'}
        </span>
      )
    case 'is_active':
      return (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {value ? 'Active' : 'Inactive'}
        </span>
      )
    case 'day_of_week':
      return (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ['Friday', 'Saturday', 'Sunday'].includes(value as string)
            ? 'bg-purple-100 text-purple-800'
            : 'bg-blue-100 text-blue-800'
        }`}>
          {value}
        </span>
      )
    case 'business_name':
      return (
        <div className="max-w-xs">
          <div className="font-medium text-gray-900">{value}</div>
          {deal.google_profile && (
            <a
              href={deal.google_profile}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-primary hover:underline"
            >
              View on Google →
            </a>
          )}
        </div>
      )
    case 'special_description':
      return (
        <div className="max-w-xs">
          <div className="text-gray-900 text-sm">{value}</div>
          {deal.special_time && (
            <div className="text-xs text-gray-500 mt-1">{deal.special_time}</div>
          )}
        </div>
      )
    default:
      return <span className="text-gray-900">{value?.toString() || '—'}</span>
  }
}

// Component for editing cell values
function EditCell({
  column,
  value,
  onChange
}: {
  column: ColumnConfig;
  value: any;
  onChange: (value: any) => void
}) {
  switch (column.key) {
    case 'day_of_week':
      return (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
        >
          {DAYS_OF_WEEK.map(day => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
      )
    case 'is_featured':
    case 'is_active':
      return (
        <input
          type="checkbox"
          checked={value || false}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-gray-300"
        />
      )
    case 'special_description':
      return (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
          rows={2}
        />
      )
    default:
      return (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
        />
      )
  }
}

// Add Deal Form Component
function AddDealForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    business_name: '',
    business_address: '',
    google_profile: '',
    day_of_week: 'Monday' as DiningDeal['day_of_week'],
    special_description: '',
    special_time: '',
    is_featured: false
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/dining/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create deal')
      }

      onSuccess()
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Business Name *</label>
        <input
          type="text"
          required
          value={formData.business_name}
          onChange={(e) => setFormData(prev => ({ ...prev, business_name: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Business Address</label>
        <input
          type="text"
          value={formData.business_address}
          onChange={(e) => setFormData(prev => ({ ...prev, business_address: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Google Profile URL</label>
        <input
          type="url"
          value={formData.google_profile}
          onChange={(e) => setFormData(prev => ({ ...prev, google_profile: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          placeholder="https://..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week *</label>
        <select
          required
          value={formData.day_of_week}
          onChange={(e) => setFormData(prev => ({ ...prev, day_of_week: e.target.value as DiningDeal['day_of_week'] }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          {DAYS_OF_WEEK.map(day => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Special Description *</label>
        <textarea
          required
          value={formData.special_description}
          onChange={(e) => setFormData(prev => ({ ...prev, special_description: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Special Time</label>
        <input
          type="text"
          value={formData.special_time}
          onChange={(e) => setFormData(prev => ({ ...prev, special_time: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          placeholder="e.g., 11AM - 3PM, All day"
        />
      </div>

      <div>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={formData.is_featured}
            onChange={(e) => setFormData(prev => ({ ...prev, is_featured: e.target.checked }))}
            className="rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-700">Featured Deal</span>
        </label>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-primary border border-transparent rounded-md hover:bg-brand-dark disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add Deal'}
        </button>
      </div>
    </form>
  )
}

// CSV Upload Form Component
function CsvUploadForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setUploading(true)
    setError('')
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/dining/upload-csv', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const result = await response.json()
      setResult(result.results)
      onSuccess()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">
          <div className="font-medium">Upload completed!</div>
          <div className="text-xs mt-1">
            Created: {result.created}, Skipped: {result.skipped}, Errors: {result.errors?.length || 0}
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="mt-2">
              <div className="font-medium">Errors:</div>
              <ul className="list-disc list-inside text-xs">
                {result.errors.map((error: string, index: number) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select CSV File
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            CSV should have columns: Business Name, Business Address, Google Profile, Day of Week, Special Description, Special Time
          </p>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="submit"
              disabled={!file || uploading}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload CSV'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}