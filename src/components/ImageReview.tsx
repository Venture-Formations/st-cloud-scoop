'use client'

import { useState, useEffect } from 'react'
import { Image, ImageTag, ImageReviewRequest } from '@/types/database'

interface ImageReviewProps {
  imageId: string
  onComplete?: () => void
  onSkip?: () => void
  onPrevious?: () => void
  showNavigation?: boolean
  navigationText?: string
}

const TAG_CATEGORIES = {
  people: { label: 'People', color: 'bg-purple-100 text-purple-800' },
  scene: { label: 'Scene', color: 'bg-green-100 text-green-800' },
  theme: { label: 'Theme', color: 'bg-blue-100 text-blue-800' },
  style: { label: 'Style', color: 'bg-yellow-100 text-yellow-800' },
  color: { label: 'Color', color: 'bg-pink-100 text-pink-800' },
  object: { label: 'Object', color: 'bg-indigo-100 text-indigo-800' },
  safety: { label: 'Safety', color: 'bg-red-100 text-red-800' }
}

export default function ImageReview({
  imageId,
  onComplete,
  onSkip,
  onPrevious,
  showNavigation = true,
  navigationText = "Review Image"
}: ImageReviewProps) {
  const [image, setImage] = useState<Image | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editedTags, setEditedTags] = useState<ImageTag[]>([])
  const [newTagType, setNewTagType] = useState<keyof typeof TAG_CATEGORIES>('object')
  const [newTagName, setNewTagName] = useState('')
  const [newTagConf, setNewTagConf] = useState(0.9)
  const [editedData, setEditedData] = useState({
    ai_caption: '',
    ai_alt_text: '',
    license: '',
    credit: '',
    location: '',
    source_url: '',
    crop_v_offset: 0.5
  })
  const [cropPreviewStyle, setCropPreviewStyle] = useState({})

  useEffect(() => {
    fetchImage()
  }, [imageId])

  useEffect(() => {
    updateCropPreview()
  }, [editedData.crop_v_offset, image])

  const fetchImage = async () => {
    try {
      const response = await fetch(`/api/images/${imageId}`)
      if (response.ok) {
        const imageData: Image = await response.json()
        setImage(imageData)
        setEditedTags(imageData.ai_tags_scored || [])
        setEditedData({
          ai_caption: imageData.ai_caption || '',
          ai_alt_text: imageData.ai_alt_text || '',
          license: imageData.license || '',
          credit: imageData.credit || '',
          location: imageData.location || '',
          source_url: imageData.source_url || '',
          crop_v_offset: imageData.crop_v_offset || 0.5
        })
      }
    } catch (error) {
      console.error('Failed to fetch image:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateCropPreview = () => {
    if (!image) return

    const aspectRatio = 16 / 9
    const imageAspectRatio = (image.width || 1) / (image.height || 1)

    if (imageAspectRatio > aspectRatio) {
      // Image is wider than 16:9, crop horizontally
      const cropHeight = 100 // Use full height
      const cropWidth = (cropHeight * aspectRatio * imageAspectRatio) / imageAspectRatio
      const offsetX = (100 - cropWidth) / 2

      setCropPreviewStyle({
        position: 'absolute',
        top: `${editedData.crop_v_offset * 100}%`,
        left: `${offsetX}%`,
        width: `${cropWidth}%`,
        height: `${cropHeight}%`,
        transform: 'translateY(-50%)',
        border: '2px solid #3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)'
      })
    } else {
      // Image is taller than 16:9, crop vertically
      const cropWidth = 100 // Use full width
      const cropHeight = cropWidth / aspectRatio / imageAspectRatio
      const offsetY = editedData.crop_v_offset * (100 - cropHeight)

      setCropPreviewStyle({
        position: 'absolute',
        top: `${offsetY}%`,
        left: '0%',
        width: `${cropWidth}%`,
        height: `${cropHeight}%`,
        border: '2px solid #3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)'
      })
    }
  }

  const handleAddTag = () => {
    if (!newTagName.trim()) return

    const newTag: ImageTag = {
      type: newTagType,
      name: newTagName.toLowerCase().replace(/\s+/g, '_'),
      conf: newTagConf
    }

    setEditedTags([...editedTags, newTag])
    setNewTagName('')
  }

  const handleRemoveTag = (index: number) => {
    setEditedTags(editedTags.filter((_, i) => i !== index))
  }

  const handleTagConfidenceChange = (index: number, conf: number) => {
    setEditedTags(editedTags.map((tag, i) =>
      i === index ? { ...tag, conf } : tag
    ))
  }

  const generateTopTags = (tags: ImageTag[]): string[] => {
    return tags
      .filter(tag => tag.conf >= 0.5)
      .sort((a, b) => b.conf - a.conf)
      .slice(0, 5)
      .map(tag => `${tag.type}_${tag.name}`)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const reviewRequest: ImageReviewRequest = {
        image_id: imageId,
        ai_caption: editedData.ai_caption,
        ai_alt_text: editedData.ai_alt_text,
        ai_tags: generateTopTags(editedTags),
        ai_tags_scored: editedTags,
        license: editedData.license,
        credit: editedData.credit,
        location: editedData.location,
        crop_v_offset: editedData.crop_v_offset,
        source_url: editedData.source_url
      }

      const response = await fetch('/api/images/review/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewRequest)
      })

      if (response.ok) {
        if (onComplete) onComplete()
      } else {
        const error = await response.json()
        alert(`Failed to save: ${error.error}`)
      }
    } catch (error) {
      console.error('Save error:', error)
      alert('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleApproveAll = () => {
    // Keep all current tags and save
    handleSave()
  }

  const handleClearAll = () => {
    setEditedTags([])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading image...</div>
      </div>
    )
  }

  if (!image) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">Image not found</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{navigationText}</h1>
        {showNavigation && (
          <div className="flex gap-2">
            {onPrevious && (
              <button
                onClick={onPrevious}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                ← Previous
              </button>
            )}
            {onSkip && (
              <button
                onClick={onSkip}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Skip
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Image Preview Section */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4">Image Preview</h2>

            {/* Original Image */}
            <div className="relative bg-gray-100 rounded overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <img
                src={image.cdn_url}
                alt={image.ai_alt_text || 'Preview'}
                className="w-full h-full object-contain"
              />
              <div style={cropPreviewStyle}>
                <div className="absolute inset-0 border-dashed border-2 border-white opacity-75"></div>
              </div>
            </div>

            {/* Crop Slider */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vertical Crop Position: {Math.round(editedData.crop_v_offset * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={editedData.crop_v_offset}
                onChange={(e) => setEditedData({
                  ...editedData,
                  crop_v_offset: parseFloat(e.target.value)
                })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Top</span>
                <span>Center</span>
                <span>Bottom</span>
              </div>
            </div>

            {/* Image Stats */}
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Dimensions:</span> {image.width}×{image.height}
              </div>
              <div>
                <span className="font-medium">Orientation:</span> {image.orientation}
              </div>
              <div>
                <span className="font-medium">Faces:</span> {image.faces_count}
              </div>
              <div>
                <span className="font-medium">Has Text:</span> {image.has_text ? 'Yes' : 'No'}
              </div>
            </div>
          </div>
        </div>

        {/* Editing Section */}
        <div className="space-y-4">
          {/* Caption and Alt Text */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4">Caption & Description</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Caption
                </label>
                <textarea
                  value={editedData.ai_caption}
                  onChange={(e) => setEditedData({ ...editedData, ai_caption: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={3}
                  placeholder="Describe what's in the image..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alt Text (10-14 words)
                </label>
                <input
                  type="text"
                  value={editedData.ai_alt_text}
                  onChange={(e) => setEditedData({ ...editedData, ai_alt_text: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Brief description for screen readers..."
                />
              </div>
            </div>
          </div>

          {/* Tags Editor */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Tags</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleApproveAll}
                  className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                >
                  Approve All
                </button>
                <button
                  onClick={handleClearAll}
                  className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Existing Tags */}
            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
              {Object.entries(TAG_CATEGORIES).map(([category, { label, color }]) => {
                const categoryTags = editedTags.filter(tag => tag.type === category)
                if (categoryTags.length === 0) return null

                return (
                  <div key={category} className="border rounded p-3">
                    <h4 className="font-medium text-sm text-gray-700 mb-2">{label}</h4>
                    <div className="space-y-2">
                      {categoryTags.map((tag, index) => {
                        const globalIndex = editedTags.findIndex(t => t === tag)
                        return (
                          <div key={index} className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs ${color}`}>
                              {tag.name}
                            </span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={tag.conf}
                              onChange={(e) => handleTagConfidenceChange(globalIndex, parseFloat(e.target.value))}
                              className="flex-1 h-2"
                            />
                            <span className="text-xs w-8 text-gray-600">
                              {Math.round(tag.conf * 100)}%
                            </span>
                            <button
                              onClick={() => handleRemoveTag(globalIndex)}
                              className="text-red-500 hover:text-red-700 text-sm"
                            >
                              ✕
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add New Tag */}
            <div className="border-t pt-4">
              <h4 className="font-medium text-sm text-gray-700 mb-2">Add Tag</h4>
              <div className="flex gap-2">
                <select
                  value={newTagType}
                  onChange={(e) => setNewTagType(e.target.value as keyof typeof TAG_CATEGORIES)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  {Object.entries(TAG_CATEGORIES).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Tag name"
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={newTagConf}
                  onChange={(e) => setNewTagConf(parseFloat(e.target.value))}
                  className="w-16"
                />
                <span className="text-xs text-gray-600 w-8">
                  {Math.round(newTagConf * 100)}%
                </span>
                <button
                  onClick={handleAddTag}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4">Metadata</h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">License</label>
                <input
                  type="text"
                  value={editedData.license}
                  onChange={(e) => setEditedData({ ...editedData, license: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., CC BY 4.0, All Rights Reserved"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credit</label>
                <input
                  type="text"
                  value={editedData.credit}
                  onChange={(e) => setEditedData({ ...editedData, credit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Photographer or source name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  value={editedData.location}
                  onChange={(e) => setEditedData({ ...editedData, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Where the photo was taken"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source URL</label>
                <input
                  type="url"
                  value={editedData.source_url}
                  onChange={(e) => setEditedData({ ...editedData, source_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Original image URL"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}