import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const originalBlob = formData.get('original') as Blob
    const croppedBlob = formData.get('cropped') as Blob
    const eventTitle = formData.get('eventTitle') as string

    console.log('Upload request received:', {
      hasOriginal: !!originalBlob,
      hasOriginalSize: originalBlob?.size,
      hasCropped: !!croppedBlob,
      hasCroppedSize: croppedBlob?.size,
      hasTitle: !!eventTitle,
      title: eventTitle
    })

    if (!originalBlob || !croppedBlob || !eventTitle) {
      console.error('Missing required fields:', {
        hasOriginal: !!originalBlob,
        hasCropped: !!croppedBlob,
        hasTitle: !!eventTitle
      })
      return NextResponse.json({
        error: 'Missing required fields',
        details: {
          hasOriginal: !!originalBlob,
          hasCropped: !!croppedBlob,
          hasTitle: !!eventTitle
        }
      }, { status: 400 })
    }

    // Create safe filename from event title
    const timestamp = Date.now()
    const safeTitle = eventTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50)

    const originalPath = `public-events/originals/${safeTitle}-${timestamp}.jpg`
    const croppedPath = `public-events/cropped/${safeTitle}-${timestamp}.jpg`

    console.log('Uploading to Supabase Storage...')

    // Upload original image to Supabase Storage
    const { data: originalData, error: originalError } = await supabaseAdmin.storage
      .from('images')
      .upload(originalPath, originalBlob, {
        contentType: 'image/jpeg',
        upsert: false
      })

    if (originalError) {
      console.error('Original upload error:', originalError)
      throw new Error(`Failed to upload original image: ${originalError.message}`)
    }

    // Get public URL for original
    const { data: originalUrlData } = supabaseAdmin.storage
      .from('images')
      .getPublicUrl(originalPath)

    // Upload cropped image to Supabase Storage
    const { data: croppedData, error: croppedError } = await supabaseAdmin.storage
      .from('images')
      .upload(croppedPath, croppedBlob, {
        contentType: 'image/jpeg',
        upsert: false
      })

    if (croppedError) {
      console.error('Cropped upload error:', croppedError)
      // Try to clean up original image
      await supabaseAdmin.storage.from('images').remove([originalPath])
      throw new Error(`Failed to upload cropped image: ${croppedError.message}`)
    }

    // Get public URL for cropped
    const { data: croppedUrlData } = supabaseAdmin.storage
      .from('images')
      .getPublicUrl(croppedPath)

    console.log('Upload successful:', {
      originalUrl: originalUrlData.publicUrl,
      croppedUrl: croppedUrlData.publicUrl
    })

    // Return the public URLs
    return NextResponse.json({
      original_url: originalUrlData.publicUrl,
      cropped_url: croppedUrlData.publicUrl,
    })

  } catch (error) {
    console.error('Image upload failed:', error)
    return NextResponse.json({
      error: 'Image upload failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
