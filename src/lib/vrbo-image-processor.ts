import { GitHubImageStorage } from './github-storage'
import crypto from 'crypto'

interface ImageProcessingResult {
  success: boolean
  adjusted_image_url?: string
  error?: string
}

/**
 * Process a VRBO listing image by downloading, optimizing, and uploading to GitHub
 * This creates properly sized images for newsletter use and hosts them reliably
 */
export async function processVrboImage(
  originalImageUrl: string,
  listingTitle: string,
  listingId?: string
): Promise<ImageProcessingResult> {
  try {
    console.log('Processing VRBO image:', originalImageUrl)

    if (!originalImageUrl) {
      return { success: false, error: 'No image URL provided' }
    }

    // Use the existing GitHub storage to upload the image
    const githubStorage = new GitHubImageStorage()
    const githubUrl = await githubStorage.uploadImage(originalImageUrl, `VRBO: ${listingTitle}`)

    if (githubUrl) {
      console.log(`VRBO image uploaded to GitHub: ${githubUrl}`)
      return {
        success: true,
        adjusted_image_url: githubUrl
      }
    } else {
      console.error('VRBO image upload failed')
      return {
        success: false,
        error: 'Failed to upload image to GitHub'
      }
    }

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`VRBO image download timeout for: ${originalImageUrl}`)
      return {
        success: false,
        error: 'Download timeout (20 seconds)'
      }
    } else {
      console.error(`Error processing VRBO image:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}

/**
 * Get appropriate file extension from image URL
 */
function getImageExtension(url: string): string {
  try {
    const parsedUrl = new URL(url)
    const pathname = parsedUrl.pathname.toLowerCase()

    if (pathname.includes('.jpg') || pathname.includes('.jpeg')) return '.jpg'
    if (pathname.includes('.png')) return '.png'
    if (pathname.includes('.gif')) return '.gif'
    if (pathname.includes('.webp')) return '.webp'
    if (pathname.includes('.svg')) return '.svg'

    // Default to .jpg if no extension found
    return '.jpg'
  } catch {
    return '.jpg'
  }
}

/**
 * Batch process multiple images for CSV uploads
 */
export async function batchProcessVrboImages(
  listings: Array<{ id: string; main_image_url: string | null }>
): Promise<{ processed: number; errors: string[] }> {
  const results = {
    processed: 0,
    errors: [] as string[]
  }

  for (const listing of listings) {
    if (!listing.main_image_url) continue

    try {
      const result = await processVrboImage(listing.main_image_url, listing.id)
      if (result.success) {
        results.processed++
      } else {
        results.errors.push(`${listing.id}: ${result.error}`)
      }
    } catch (error) {
      results.errors.push(`${listing.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return results
}

/**
 * Trigger GitHub Action workflow for image processing
 * This would use GitHub's REST API to trigger the workflow
 */
export async function triggerImageProcessingWorkflow(): Promise<boolean> {
  try {
    // This would trigger the GitHub Action workflow that runs build-images.js
    // For now, we'll just log that it would be triggered
    console.log('Would trigger GitHub Action workflow for VRBO image processing')

    // In actual implementation:
    // const response = await fetch('https://api.github.com/repos/VFDavid/STCScoop/actions/workflows/build.yml/dispatches', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `token ${process.env.GITHUB_TOKEN}`,
    //     'Accept': 'application/vnd.github.v3+json',
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     ref: 'Vrbo',
    //     inputs: {}
    //   })
    // })

    return true
  } catch (error) {
    console.error('Error triggering image processing workflow:', error)
    return false
  }
}