'use client'

import { useRef, useEffect, useState } from 'react'

interface AdImageCropperProps {
  imageFile: File
  onCropComplete: (croppedBlob: Blob, croppedDataUrl: string) => void
  cropOffset: number
  onCropOffsetChange: (offset: number) => void
}

/**
 * Image cropper component for advertisement images
 * Crops to 5:4 aspect ratio with vertical position adjustment
 */
export default function AdImageCropper({
  imageFile,
  onCropComplete,
  cropOffset,
  onCropOffsetChange
}: AdImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageUrl, setImageUrl] = useState<string>('')
  const [canAdjustVertical, setCanAdjustVertical] = useState(true)

  // Create object URL for the image file
  useEffect(() => {
    const url = URL.createObjectURL(imageFile)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  // Update crop preview when offset changes or image loads
  useEffect(() => {
    if (imageRef.current?.complete) {
      updateCropPreview()
    }
  }, [cropOffset, imageUrl])

  const updateCropPreview = () => {
    if (!canvasRef.current || !imageRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = imageRef.current

    if (!ctx || !img.complete) return

    // Set canvas size to 5:4 aspect ratio (e.g., 500x400)
    const targetWidth = 500
    const targetHeight = Math.round(targetWidth / (5/4))
    canvas.width = targetWidth
    canvas.height = targetHeight

    // Calculate crop area from original image
    const originalWidth = img.naturalWidth
    const originalHeight = img.naturalHeight
    const targetAspectRatio = 5 / 4
    const originalAspectRatio = originalWidth / originalHeight

    let sourceWidth, sourceHeight, sourceX, sourceY

    if (originalAspectRatio > targetAspectRatio) {
      // Image is wider than 5:4, crop horizontally (centered)
      sourceHeight = originalHeight
      sourceWidth = Math.round(sourceHeight * targetAspectRatio)
      sourceX = Math.round((originalWidth - sourceWidth) / 2)
      sourceY = 0
      setCanAdjustVertical(false)
    } else {
      // Image is taller than 5:4, crop vertically (adjustable)
      sourceWidth = originalWidth
      sourceHeight = Math.round(sourceWidth / targetAspectRatio)
      sourceX = 0
      // Apply vertical offset
      const maxTop = originalHeight - sourceHeight
      sourceY = Math.round(cropOffset * maxTop)
      setCanAdjustVertical(true)
    }

    // Draw the cropped image on canvas
    ctx.drawImage(
      img,
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, targetWidth, targetHeight
    )

    // Add border to show crop area
    ctx.strokeStyle = '#3B82F6'
    ctx.lineWidth = 3
    ctx.strokeRect(0, 0, targetWidth, targetHeight)

    // Generate cropped blob
    canvas.toBlob((blob) => {
      if (blob) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
        onCropComplete(blob, dataUrl)
      }
    }, 'image/jpeg', 0.9)
  }

  return (
    <div className="space-y-4">
      {/* Hidden original image for processing */}
      <img
        ref={imageRef}
        src={imageUrl}
        alt="Original"
        className="hidden"
        onLoad={updateCropPreview}
      />

      {/* Crop Preview */}
      <div className="flex flex-col items-center">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          5:4 Crop Preview
        </h4>
        <canvas
          ref={canvasRef}
          className="border-2 border-blue-500 rounded shadow-lg"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>

      {/* Vertical Position Adjustment */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Vertical Position
        </label>
        {canAdjustVertical ? (
          <>
            <div className="flex items-center space-x-3">
              <span className="text-xs text-gray-500 w-12">Top</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={cropOffset}
                onChange={(e) => onCropOffsetChange(parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-gray-500 w-12 text-right">Bottom</span>
            </div>
            <div className="text-center text-xs text-gray-500 mt-1">
              Position: {Math.round(cropOffset * 100)}%
            </div>
          </>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">
              Vertical adjustment not available
            </div>
            <div className="text-xs text-gray-400">
              This image is wider than 5:4, so the full height is used.
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 text-center">
        Image will be cropped to 5:4 ratio (perfect for newsletters)
      </div>
    </div>
  )
}
