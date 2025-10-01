import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const originalBlob = formData.get('original') as Blob
    const croppedBlob = formData.get('cropped') as Blob
    const eventTitle = formData.get('eventTitle') as string

    if (!originalBlob || !croppedBlob || !eventTitle) {
      return NextResponse.json({
        error: 'Missing required fields'
      }, { status: 400 })
    }

    const githubToken = process.env.GITHUB_TOKEN
    const repoOwner = process.env.GITHUB_REPO_OWNER
    const repoName = process.env.GITHUB_REPO_NAME

    if (!githubToken || !repoOwner || !repoName) {
      console.error('Missing GitHub configuration:', {
        hasToken: !!githubToken,
        hasOwner: !!repoOwner,
        hasRepo: !!repoName
      })
      return NextResponse.json({
        error: 'GitHub configuration not set up. Please contact administrator.',
        details: 'Missing: ' + [
          !githubToken && 'GITHUB_TOKEN',
          !repoOwner && 'GITHUB_REPO_OWNER',
          !repoName && 'GITHUB_REPO_NAME'
        ].filter(Boolean).join(', ')
      }, { status: 500 })
    }

    // Create safe filename from event title
    const timestamp = Date.now()
    const safeTitle = eventTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50)

    const originalFilename = `public-events/originals/${safeTitle}-${timestamp}.jpg`
    const croppedFilename = `public-events/cropped/${safeTitle}-${timestamp}.jpg`

    // Convert original blob to base64
    const originalArrayBuffer = await originalBlob.arrayBuffer()
    const originalBase64 = Buffer.from(originalArrayBuffer).toString('base64')

    // Convert cropped blob to base64
    const croppedArrayBuffer = await croppedBlob.arrayBuffer()
    const croppedBase64 = Buffer.from(croppedArrayBuffer).toString('base64')

    // Upload original image
    const originalResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${originalFilename}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Add original image for event: ${eventTitle}`,
          content: originalBase64,
        }),
      }
    )

    if (!originalResponse.ok) {
      const error = await originalResponse.json()
      console.error('GitHub original upload error:', {
        status: originalResponse.status,
        statusText: originalResponse.statusText,
        error,
        filename: originalFilename
      })
      throw new Error(`Failed to upload original image to GitHub: ${error.message || originalResponse.statusText}`)
    }

    const originalData = await originalResponse.json()

    // Upload cropped image
    const croppedResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${croppedFilename}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Add cropped image for event: ${eventTitle}`,
          content: croppedBase64,
        }),
      }
    )

    if (!croppedResponse.ok) {
      const error = await croppedResponse.json()
      console.error('GitHub cropped upload error:', {
        status: croppedResponse.status,
        statusText: croppedResponse.statusText,
        error,
        filename: croppedFilename
      })
      throw new Error(`Failed to upload cropped image to GitHub: ${error.message || croppedResponse.statusText}`)
    }

    const croppedData = await croppedResponse.json()

    // Return the download URLs
    return NextResponse.json({
      original_url: originalData.content.download_url,
      cropped_url: croppedData.content.download_url,
    })

  } catch (error) {
    console.error('Image upload failed:', error)
    return NextResponse.json({
      error: 'Image upload failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
