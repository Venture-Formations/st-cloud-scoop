'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { ImageAnalysisResult, ImageTag } from '@/types/database'

interface UploadResult {
  file: File
  status: 'pending' | 'uploading' | 'analyzing' | 'completed' | 'error' | 'skipped'
  progress: number
  error?: string
  imageId?: string
  analysisResult?: ImageAnalysisResult
}

interface ImageReviewProps {
  uploadResults: UploadResult[]
  onComplete: (processedImages: ProcessedImage[]) => void
  onClose: () => void
  onUpdateUploadResults: (updatedResults: UploadResult[]) => void
}

interface ProcessedImage {
  imageId: string
  tags: string[]
  cropOffset: number
  location: string
  skipped: boolean
}

export default function ImageReview({ uploadResults, onComplete, onClose, onUpdateUploadResults }: ImageReviewProps) {

  const [currentIndex, setCurrentIndex] = useState(0)
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([])
  const [cropOffset, setCropOffset] = useState(0.5) // 0 = top, 0.5 = center, 1 = bottom
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [location, setLocation] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  // Filter to only completed uploads with analysis results
  const completedUploads = uploadResults.filter(
    result => result.status === 'completed' && result.analysisResult && result.imageId
  )

  const currentUpload = completedUploads[currentIndex]

  // Initialize current image data
  useEffect(() => {
    if (currentUpload?.analysisResult) {
      const existingProcessed = processedImages.find(p => p.imageId === currentUpload.imageId)
      if (existingProcessed) {
        setCropOffset(existingProcessed.cropOffset)
        setTags(existingProcessed.tags)
        setLocation(existingProcessed.location)
      } else {
        setCropOffset(0.5) // Default to center
        setTags(currentUpload.analysisResult.top_tags || [])
        setLocation('') // Default to empty
      }
    }
  }, [currentIndex, currentUpload, processedImages])

  // Update crop preview when offset changes
  useEffect(() => {
    updateCropPreview()
  }, [cropOffset, currentUpload])

  const updateCropPreview = () => {
    if (!canvasRef.current || !imageRef.current || !currentUpload) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = imageRef.current

    if (!ctx || !img.complete) return

    // Set canvas size to 16:9 aspect ratio
    const targetWidth = 400
    const targetHeight = Math.round(targetWidth / (16/9))
    canvas.width = targetWidth
    canvas.height = targetHeight

    // Calculate crop area from original image (matching backend Sharp.js logic exactly)
    const originalWidth = img.naturalWidth
    const originalHeight = img.naturalHeight
    const targetAspectRatio = 16 / 9
    const originalAspectRatio = originalWidth / originalHeight

    let sourceWidth, sourceHeight, sourceX, sourceY

    if (originalAspectRatio > targetAspectRatio) {
      // Image is wider than 16:9, crop horizontally (keep full height)
      sourceHeight = originalHeight
      sourceWidth = Math.round(sourceHeight * targetAspectRatio)
      sourceX = Math.round((originalWidth - sourceWidth) / 2)
      sourceY = 0
    } else {
      // Image is taller than 16:9, crop vertically
      sourceWidth = originalWidth
      sourceHeight = Math.round(sourceWidth / targetAspectRatio)
      sourceX = 0
      // Apply vertical offset (matching backend exactly)
      const maxTop = originalHeight - sourceHeight
      sourceY = Math.round(cropOffset * maxTop)
    }


    // Draw the cropped image on canvas
    ctx.drawImage(
      img,
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, targetWidth, targetHeight
    )

    // Add a subtle border to show the crop area
    ctx.strokeStyle = '#3B82F6'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, targetWidth, targetHeight)
  }

  const saveCurrentImage = () => {
    if (!currentUpload?.imageId) return

    const processed: ProcessedImage = {
      imageId: currentUpload.imageId,
      tags,
      cropOffset,
      location,
      skipped: false
    }

    setProcessedImages(prev => {
      const filtered = prev.filter(p => p.imageId !== currentUpload.imageId)
      return [...filtered, processed]
    })
  }

  const handleNext = () => {
    saveCurrentImage()
    if (currentIndex < completedUploads.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handlePrevious = () => {
    saveCurrentImage()
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleSkip = async () => {
    if (!currentUpload?.imageId) return

    try {
      // Delete the image from the database
      const response = await fetch(`/api/images/${currentUpload.imageId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete image')
      }

      // Remove from uploadResults and update parent component
      const updatedUploads = uploadResults.filter(upload => upload.imageId !== currentUpload.imageId)
      onUpdateUploadResults(updatedUploads)

      // Update the completedUploads array
      const newCompletedUploads = updatedUploads.filter(
        result => result.status === 'completed' && result.analysisResult && result.imageId
      )

      if (newCompletedUploads.length === 0) {
        // No more images, close the review
        onComplete([])
        return
      }

      // Navigate to next image or previous if this was the last
      if (currentIndex >= newCompletedUploads.length) {
        // Was the last image, go to previous
        setCurrentIndex(Math.max(0, newCompletedUploads.length - 1))
      }
      // If still images left, stay on current index (will show next image)
      // If this was the last image and there are no more, it will handle automatically

    } catch (error) {
      console.error('Error deleting image:', error)
      alert('Failed to delete image. Please try again.')
    }
  }

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim().toLowerCase())) {
      setTags([...tags, newTag.trim().toLowerCase()])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleFinish = async () => {
    saveCurrentImage() // Save current image before finishing
    setIsProcessing(true)

    try {
      // Process each image through the commit endpoint
      const finalProcessed = [...processedImages]

      // Add current image if not already processed
      if (currentUpload?.imageId && !finalProcessed.find(p => p.imageId === currentUpload.imageId)) {
        finalProcessed.push({
          imageId: currentUpload.imageId,
          tags,
          cropOffset,
          location,
          skipped: false
        })
      }

      // Send each non-skipped image to the commit endpoint
      for (const processed of finalProcessed.filter(p => !p.skipped)) {
        await fetch('/api/images/review/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_id: processed.imageId,
            tags: processed.tags,
            crop_v_offset: processed.cropOffset,
            location: processed.location
          })
        })
      }

      onComplete(finalProcessed)
    } catch (error) {
      console.error('Error processing images:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  if (completedUploads.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h2 className="text-xl font-semibold mb-4">No Images to Review</h2>
          <p className="text-gray-600 mb-4">No successfully analyzed images found to review.</p>
          <button
            onClick={onClose}
            className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  if (!currentUpload) {
    return null
  }

  const imageUrl = URL.createObjectURL(currentUpload.file)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 max-w-7xl w-full mx-4 h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Review Images</h2>
            <p className="text-sm text-gray-600">
              Image {currentIndex + 1} of {completedUploads.length}: {currentUpload.file.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
          {/* Original Image */}
          <div className="flex flex-col min-h-0">
            <h3 className="text-md font-medium mb-2">Original Image</h3>
            <div className="flex-1 flex items-center justify-center min-h-0">
              <img
                ref={imageRef}
                src={imageUrl}
                alt={currentUpload.file.name}
                className="max-w-full max-h-full object-contain rounded border shadow-sm"
                onLoad={updateCropPreview}
              />
            </div>
          </div>

          {/* Crop Preview and Controls */}
          <div className="flex flex-col min-h-0">
            <h3 className="text-md font-medium mb-2">16:9 Crop Preview</h3>
            <div className="flex-1 flex flex-col justify-center min-h-0">
              {currentUpload?.analysisResult?.variant_16x9_url ? (
                <img
                  src={currentUpload.analysisResult.variant_16x9_url}
                  alt="16:9 variant preview"
                  className="border rounded shadow-sm mx-auto max-w-full h-auto"
                  style={{ maxWidth: '500px' }}
                />
              ) : (
                <canvas
                  ref={canvasRef}
                  className="border rounded shadow-sm mx-auto"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              )}

              {/* Crop Adjustment */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vertical Position
                </label>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">Top</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={cropOffset}
                    onChange={(e) => setCropOffset(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-500">Bottom</span>
                </div>
                <div className="text-center text-xs text-gray-500 mt-1">
                  Position: {Math.round(cropOffset * 100)}%
                </div>
              </div>
            </div>
          </div>

          {/* Tag Management */}
          <div className="flex flex-col min-h-0 overflow-y-auto">
            <h3 className="text-md font-medium mb-2">Review Tags</h3>

            {/* AI Caption - only show if caption exists and is not empty */}
            {currentUpload.analysisResult?.caption && currentUpload.analysisResult.caption.trim() && (
              <div className="mb-3 p-2 bg-blue-50 rounded text-xs">
                <p className="font-medium text-blue-900 mb-1">AI Caption:</p>
                <p className="text-blue-800">{currentUpload.analysisResult.caption}</p>
              </div>
            )}

            {/* Tag Management */}
            <div className="mb-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Tags:</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map((tag, index) => (
                  <button
                    key={index}
                    onClick={() => handleRemoveTag(tag)}
                    className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-800 hover:bg-red-100 hover:text-red-800 transition-colors"
                    title="Click to remove"
                  >
                    {tag}
                    <span className="ml-1">×</span>
                  </button>
                ))}
              </div>

              {/* Add New Tag */}
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="Add new tag..."
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <button
                  onClick={handleAddTag}
                  className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                >
                  +
                </button>
              </div>
            </div>

            {/* Location Field */}
            <div className="mb-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Location:</p>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., St. Cloud Police Department"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>

            {/* AI Analysis Info */}
            {currentUpload.analysisResult && (
              <div className="text-xs text-gray-500 space-y-1 mt-auto">
                <p>Dimensions: {currentUpload.analysisResult.width} × {currentUpload.analysisResult.height}</p>
                <p>Safety Score: {Math.round((currentUpload.analysisResult.safe_score || 0) * 100)}%</p>
                {currentUpload.analysisResult.faces_count > 0 && (
                  <p>Faces: {currentUpload.analysisResult.faces_count}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="flex justify-between items-center mt-4 pt-3 border-t flex-shrink-0">
          <div className="flex space-x-2">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === completedUploads.length - 1}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={handleSkip}
              className="px-4 py-2 border border-red-300 text-red-700 rounded-md text-sm hover:bg-red-50"
            >
              Skip This Image
            </button>
            <button
              onClick={currentIndex === completedUploads.length - 1 ? handleFinish : handleNext}
              disabled={isProcessing}
              className="bg-blue-600 text-white px-6 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : (currentIndex === completedUploads.length - 1 ? 'Finish' : 'Next →')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}