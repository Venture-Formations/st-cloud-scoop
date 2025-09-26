'use client'

import { useEffect, useState, useMemo } from 'react'
import Layout from '@/components/Layout'
import ImageUpload from '@/components/ImageUpload'
import { Image, ImageTag, ImageSearchFilters } from '@/types/database'

type SortField = 'ai_caption' | 'created_at' | 'orientation' | 'safe_score' | 'faces_count'
type SortDirection = 'asc' | 'desc'

interface ImagesFilter {
  search: string
  orientation: 'all' | 'landscape' | 'portrait' | 'square'
  hasText: 'all' | 'true' | 'false'
  hasFaces: 'all' | 'true' | 'false'
  license: string
  dateRange: 'all' | 'week' | 'month' | 'year'
}

export default function ImagesDatabasePage() {
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [filter, setFilter] = useState<ImagesFilter>({
    search: '',
    orientation: 'all',
    hasText: 'all',
    hasFaces: 'all',
    license: '',
    dateRange: 'all'
  })
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [editingImage, setEditingImage] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Image>>({})
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchImages()
  }, [])

  const fetchImages = async () => {
    try {
      const response = await fetch('/api/images')
      if (response.ok) {
        const data = await response.json()
        setImages(data.images || [])
      }
    } catch (error) {
      console.error('Failed to fetch images:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredAndSortedImages = useMemo(() => {
    let filtered = images.filter(image => {
      // Search filter (caption, alt text, tags)
      if (filter.search) {
        const searchLower = filter.search.toLowerCase()
        const matchesCaption = image.ai_caption?.toLowerCase().includes(searchLower)
        const matchesAltText = image.ai_alt_text?.toLowerCase().includes(searchLower)
        const matchesTags = image.ai_tags?.some(tag => tag.toLowerCase().includes(searchLower))
        if (!matchesCaption && !matchesAltText && !matchesTags) return false
      }

      // Orientation filter
      if (filter.orientation !== 'all' && image.orientation !== filter.orientation) return false

      // Text filter
      if (filter.hasText !== 'all') {
        const hasText = filter.hasText === 'true'
        if (image.has_text !== hasText) return false
      }

      // Faces filter
      if (filter.hasFaces !== 'all') {
        const hasFaces = filter.hasFaces === 'true'
        const imageHasFaces = (image.faces_count || 0) > 0
        if (imageHasFaces !== hasFaces) return false
      }

      // License filter
      if (filter.license && image.license !== filter.license) return false

      // Date range filter
      if (filter.dateRange !== 'all') {
        const now = new Date()
        const imageDate = new Date(image.created_at)
        let cutoff = new Date()

        switch (filter.dateRange) {
          case 'week':
            cutoff.setDate(now.getDate() - 7)
            break
          case 'month':
            cutoff.setMonth(now.getMonth() - 1)
            break
          case 'year':
            cutoff.setFullYear(now.getFullYear() - 1)
            break
        }

        if (imageDate < cutoff) return false
      }

      return true
    })

    // Sort
    filtered.sort((a, b) => {
      let aValue: any, bValue: any

      switch (sortField) {
        case 'ai_caption':
          aValue = a.ai_caption || ''
          bValue = b.ai_caption || ''
          break
        case 'created_at':
          aValue = new Date(a.created_at)
          bValue = new Date(b.created_at)
          break
        case 'orientation':
          aValue = a.orientation || ''
          bValue = b.orientation || ''
          break
        case 'safe_score':
          aValue = a.safe_score || 0
          bValue = b.safe_score || 0
          break
        case 'faces_count':
          aValue = a.faces_count || 0
          bValue = b.faces_count || 0
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [images, filter, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleEdit = (image: Image) => {
    setEditingImage(image.id)
    setEditData({
      ai_caption: image.ai_caption,
      ai_alt_text: image.ai_alt_text,
      license: image.license,
      credit: image.credit,
      location: image.location,
      source_url: image.source_url
    })
  }

  const handleCancelEdit = () => {
    setEditingImage(null)
    setEditData({})
  }

  const handleSaveEdit = async (imageId: string) => {
    setUpdating(true)
    try {
      const response = await fetch('/api/images/review/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_id: imageId,
          ...editData
        })
      })

      if (response.ok) {
        // Update the image in local state
        setImages(images.map(img =>
          img.id === imageId
            ? { ...img, ...editData, updated_at: new Date().toISOString() }
            : img
        ))
        setEditingImage(null)
        setEditData({})
      } else {
        const errorData = await response.json()
        alert(`Failed to update image: ${errorData.error}`)
      }
    } catch (error) {
      console.error('Update error:', error)
      alert('Failed to update image')
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async (imageId: string) => {
    if (!confirm('Are you sure you want to delete this image? This action cannot be undone.')) {
      return
    }

    setDeleting(imageId)
    try {
      const response = await fetch(`/api/images/${imageId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setImages(images.filter(img => img.id !== imageId))
      } else {
        const errorData = await response.json()
        alert(`Failed to delete image: ${errorData.error}`)
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete image')
    } finally {
      setDeleting(null)
    }
  }

  const handleSelectImage = (imageId: string, selected: boolean) => {
    const newSelected = new Set(selectedImages)
    if (selected) {
      newSelected.add(imageId)
    } else {
      newSelected.delete(imageId)
    }
    setSelectedImages(newSelected)
  }

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedImages(new Set(filteredAndSortedImages.map(img => img.id)))
    } else {
      setSelectedImages(new Set())
    }
  }

  const renderTagBadges = (tags: string[] | null, tagsScored: ImageTag[] | null) => {
    if (!tags || tags.length === 0) return null

    return (
      <div className="flex flex-wrap gap-1 max-w-xs">
        {tags.slice(0, 5).map((tag, index) => {
          const scoredTag = tagsScored?.find(t => `${t.type}_${t.name}` === tag)
          const confidence = scoredTag ? Math.round(scoredTag.conf * 100) : null

          return (
            <span
              key={index}
              className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
              title={confidence ? `Confidence: ${confidence}%` : undefined}
            >
              {tag.replace('_', ': ')}
            </span>
          )
        })}
        {tags.length > 5 && (
          <span className="text-xs text-gray-500">+{tags.length - 5} more</span>
        )}
      </div>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Images Database</h1>
          <button
            onClick={() => setShowUploadModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Upload Images
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                placeholder="Search captions, tags..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Orientation
              </label>
              <select
                value={filter.orientation}
                onChange={(e) => setFilter({ ...filter, orientation: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="all">All</option>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
                <option value="square">Square</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Has Text
              </label>
              <select
                value={filter.hasText}
                onChange={(e) => setFilter({ ...filter, hasText: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="all">All</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Has Faces
              </label>
              <select
                value={filter.hasFaces}
                onChange={(e) => setFilter({ ...filter, hasFaces: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="all">All</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Summary */}
        <div className="text-sm text-gray-600">
          Showing {filteredAndSortedImages.length} of {images.length} images
          {selectedImages.size > 0 && (
            <span className="ml-4 font-medium">
              {selectedImages.size} selected
            </span>
          )}
        </div>

        {/* Images Grid */}
        {loading ? (
          <div className="text-center py-8">Loading images...</div>
        ) : filteredAndSortedImages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No images found matching your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAndSortedImages.map((image) => (
              <div key={image.id} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Image Preview */}
                <div className="aspect-video bg-gray-100 relative">
                  <img
                    src={image.cdn_url}
                    alt={image.ai_alt_text || 'Image'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />

                  {/* Selection Checkbox */}
                  <div className="absolute top-2 left-2">
                    <input
                      type="checkbox"
                      checked={selectedImages.has(image.id)}
                      onChange={(e) => handleSelectImage(image.id, e.target.checked)}
                      className="w-4 h-4"
                    />
                  </div>

                  {/* Image Stats */}
                  <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                    {image.width}×{image.height}
                  </div>

                  {/* Orientation Badge */}
                  <div className="absolute bottom-2 left-2">
                    <span className={`text-xs px-2 py-1 rounded ${
                      image.orientation === 'landscape' ? 'bg-green-100 text-green-800' :
                      image.orientation === 'portrait' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {image.orientation}
                    </span>
                  </div>
                </div>

                {/* Image Details */}
                <div className="p-4 space-y-3">
                  {editingImage === image.id ? (
                    // Edit Mode
                    <div className="space-y-2">
                      <textarea
                        value={editData.ai_caption || ''}
                        onChange={(e) => setEditData({ ...editData, ai_caption: e.target.value })}
                        placeholder="Caption"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        rows={2}
                      />
                      <input
                        type="text"
                        value={editData.license || ''}
                        onChange={(e) => setEditData({ ...editData, license: e.target.value })}
                        placeholder="License"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <input
                        type="text"
                        value={editData.credit || ''}
                        onChange={(e) => setEditData({ ...editData, credit: e.target.value })}
                        placeholder="Credit"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(image.id)}
                          disabled={updating}
                          className="flex-1 bg-green-600 text-white px-2 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                        >
                          {updating ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="flex-1 bg-gray-500 text-white px-2 py-1 rounded text-sm hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <>
                      <div className="text-sm text-gray-900 line-clamp-2">
                        {image.ai_caption || 'No caption'}
                      </div>

                      {renderTagBadges(image.ai_tags, image.ai_tags_scored)}

                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{new Date(image.created_at).toLocaleDateString()}</span>
                        <div className="flex gap-2">
                          {image.faces_count > 0 && (
                            <span className="bg-purple-100 text-purple-800 px-1 py-0.5 rounded">
                              {image.faces_count} face{image.faces_count !== 1 ? 's' : ''}
                            </span>
                          )}
                          {image.has_text && (
                            <span className="bg-orange-100 text-orange-800 px-1 py-0.5 rounded">
                              Text
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(image)}
                          className="flex-1 bg-blue-600 text-white px-2 py-1 rounded text-sm hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(image.id)}
                          disabled={deleting === image.id}
                          className="flex-1 bg-red-600 text-white px-2 py-1 rounded text-sm hover:bg-red-700 disabled:opacity-50"
                        >
                          {deleting === image.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <ImageUpload
          onComplete={(results) => {
            const successfulUploads = results.filter(r => r.status === 'completed')
            if (successfulUploads.length > 0) {
              // Refresh the images list
              fetchImages()
            }
          }}
          onClose={() => setShowUploadModal(false)}
          maxFiles={10}
          maxSizeBytes={10 * 1024 * 1024}
        />
      )}
    </Layout>
  )
}