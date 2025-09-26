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
}

interface ProcessedImage {
  imageId: string
  tags: string[]
  cropOffset: number
  location: string
  skipped: boolean
}

export default function ImageReview({ uploadResults, onComplete, onClose }: ImageReviewProps) {

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
    console.log('Crop offset changed to:', cropOffset)
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

    console.log('Updating crop preview with offset:', cropOffset)
    console.log('Image dimensions:', originalWidth, 'x', originalHeight)
    console.log('Crop calculations:', { sourceX, sourceY, sourceWidth, sourceHeight })

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

  const handleSkip = () => {
    if (!currentUpload?.imageId) return

    const skipped: ProcessedImage = {
      imageId: currentUpload.imageId,
      tags: [],
      cropOffset: 0.5,
      location: '',
      skipped: true
    }

    setProcessedImages(prev => {
      const filtered = prev.filter(p => p.imageId !== currentUpload.imageId)
      return [...filtered, skipped]
    })

    if (currentIndex < completedUploads.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      // Last image, finish up
      handleFinish()
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
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold">Review Images</h2>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Side - Original Image and Crop Preview */}
          <div className="space-y-4">
            {/* Original Image */}
            <div>
              <h3 className="text-lg font-medium mb-2">Original Image</h3>
              <img
                ref={imageRef}
                src={imageUrl}
                alt={currentUpload.file.name}
                className="w-full max-w-md rounded-lg border shadow-sm"
                onLoad={updateCropPreview}
              />
            </div>

            {/* Crop Preview */}
            <div>
              <h3 className="text-lg font-medium mb-2">16:9 Crop Preview</h3>
              <canvas
                ref={canvasRef}
                className="border rounded-lg shadow-sm"
                style={{ maxWidth: '100%', height: 'auto' }}
              />

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
                  Position: {Math.round(cropOffset * 100)}% (0% = Top, 50% = Center, 100% = Bottom)
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Tag Management */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium mb-2">Review Tags</h3>

              {/* AI Caption */}
              {currentUpload.analysisResult?.caption && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 mb-1">AI Caption:</p>
                  <p className="text-sm text-blue-800">{currentUpload.analysisResult.caption}</p>
                </div>
              )}

              {/* Current Tags */}
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Current Tags:</p>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Add New Tag */}
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Add New Tag:</p>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                    placeholder="Enter tag name"
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleAddTag}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Location Field */}
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Location:</p>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., St. Cloud Police Department, Downtown St. Cloud, etc."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Specify the location where this photo was taken (optional)
                </p>
              </div>

              {/* AI Analysis Info */}
              {currentUpload.analysisResult && (
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Dimensions: {currentUpload.analysisResult.width} × {currentUpload.analysisResult.height}</p>
                  <p>Orientation: {currentUpload.analysisResult.orientation}</p>
                  <p>Safety Score: {Math.round((currentUpload.analysisResult.safe_score || 0) * 100)}%</p>
                  {currentUpload.analysisResult.faces_count > 0 && (
                    <p>Faces Detected: {currentUpload.analysisResult.faces_count}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t">
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
            {currentIndex === completedUploads.length - 1 ? (
              <button
                onClick={handleFinish}
                disabled={isProcessing}
                className="bg-green-600 text-white px-6 py-2 rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {isProcessing ? 'Processing...' : 'Finish'}
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="bg-blue-600 text-white px-6 py-2 rounded-md text-sm hover:bg-blue-700"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}