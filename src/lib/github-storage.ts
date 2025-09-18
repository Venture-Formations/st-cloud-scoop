import { Octokit } from '@octokit/rest'
import crypto from 'crypto'

export class GitHubImageStorage {
  private octokit: Octokit
  private owner: string
  private repo: string

  constructor() {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN environment variable is required')
    }
    if (!process.env.GITHUB_OWNER) {
      throw new Error('GITHUB_OWNER environment variable is required')
    }
    if (!process.env.GITHUB_REPO) {
      throw new Error('GITHUB_REPO environment variable is required')
    }

    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    })
    this.owner = process.env.GITHUB_OWNER
    this.repo = process.env.GITHUB_REPO
  }

  async uploadImage(imageUrl: string, articleTitle: string): Promise<string | null> {
    try {
      console.log(`Downloading image from: ${imageUrl}`)

      // Download image with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

      const response = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'StCloudScoop-Newsletter/1.0'
        }
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        console.error(`Failed to download image: HTTP ${response.status} ${response.statusText}`)
        return null
      }

      // Check content type
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.startsWith('image/')) {
        console.error(`Invalid content type for image: ${contentType}`)
        return null
      }

      // Get image data
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Check file size (limit to 5MB)
      if (buffer.length > 5 * 1024 * 1024) {
        console.error(`Image too large: ${buffer.length} bytes (max 5MB)`)
        return null
      }

      // Generate hash of the image URL for deduplication
      const imageHash = crypto.createHash('md5').update(imageUrl).digest('hex')
      const fileExtension = this.getImageExtension(imageUrl)
      const fileName = `${imageHash}${fileExtension}`
      const filePath = `newsletter-images/${fileName}`

      // Check if image already exists in repository
      try {
        const { data: existingFile } = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
        })

        if (existingFile && 'download_url' in existingFile && existingFile.download_url) {
          console.log(`Image already exists in GitHub: ${fileName}`)
          return existingFile.download_url
        }
      } catch (error: any) {
        // File doesn't exist, which is fine - we'll create it
        if (error.status !== 404) {
          console.error('Error checking existing file:', error)
          return null
        }
      }

      // Convert buffer to base64 for GitHub API
      const content = buffer.toString('base64')

      // Upload to GitHub
      const uploadResponse = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        message: `Add newsletter image for article: ${articleTitle}`,
        content: content,
      })

      if (uploadResponse.data.content?.download_url) {
        console.log(`Image uploaded to GitHub: ${uploadResponse.data.content.download_url}`)
        return uploadResponse.data.content.download_url
      } else {
        console.error('Upload successful but no download URL returned')
        return null
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`Image download timeout for: ${imageUrl}`)
      } else {
        console.error(`Error uploading image to GitHub:`, error)
      }
      return null
    }
  }

  private getImageExtension(url: string): string {
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

  async listImages(): Promise<string[]> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: 'newsletter-images',
      })

      if (Array.isArray(data)) {
        return data
          .filter(file => file.type === 'file')
          .map(file => file.download_url)
          .filter((url): url is string => url !== null)
      }

      return []
    } catch (error) {
      console.error('Error listing GitHub images:', error)
      return []
    }
  }
}