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

  async uploadWeatherImage(imageUrl: string, forecastDate: string): Promise<string | null> {
    try {
      console.log(`Downloading weather image from: ${imageUrl}`)

      // Download image with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

      const response = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'StCloudScoop-Newsletter/1.0',
          'Accept': 'image/*',
          'Cache-Control': 'no-cache'
        }
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        console.error(`Failed to download weather image: HTTP ${response.status} ${response.statusText}`)
        return null
      }

      // Check content type
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.startsWith('image/')) {
        console.error(`Invalid content type for weather image: ${contentType}`)
        return null
      }

      // Get image data
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Check file size (limit to 5MB)
      if (buffer.length > 5 * 1024 * 1024) {
        console.error(`Weather image too large: ${buffer.length} bytes (max 5MB)`)
        return null
      }

      // Generate filename for weather image: weather-YYYY-MM-DD.png
      const fileName = `weather-${forecastDate}.png`
      const filePath = `weather-images/${fileName}`

      // Check if weather image already exists for this date
      try {
        const { data: existingFile } = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
        })

        if (existingFile && 'download_url' in existingFile && existingFile.download_url) {
          console.log(`Weather image already exists for ${forecastDate}: ${fileName}`)
          return existingFile.download_url
        }
      } catch (error: any) {
        // File doesn't exist, which is fine - we'll create it
        if (error.status !== 404) {
          console.error('Error checking existing weather image:', error)
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
        message: `Add weather forecast image for ${forecastDate}`,
        content: content,
      })

      if (uploadResponse.data.content?.download_url) {
        console.log(`Weather image uploaded to GitHub: ${uploadResponse.data.content.download_url}`)
        return uploadResponse.data.content.download_url
      } else {
        console.error('Weather image upload successful but no download URL returned')
        return null
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`Weather image download timeout for: ${imageUrl}`)
      } else {
        console.error(`Error uploading weather image to GitHub:`, error)
      }
      return null
    }
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
          'User-Agent': 'StCloudScoop-Newsletter/1.0',
          'Accept': 'image/*',
          'Cache-Control': 'no-cache'
        }
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        console.error(`Failed to download image: HTTP ${response.status} ${response.statusText}`)
        console.error(`Response headers:`, Object.fromEntries(response.headers.entries()))

        // Log specific error for Facebook URLs
        if (imageUrl.includes('fbcdn.net')) {
          console.error(`Facebook CDN URL failed - likely expired or restricted: ${imageUrl}`)
        }

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

  async listWeatherImages(): Promise<string[]> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: 'weather-images',
      })

      if (Array.isArray(data)) {
        return data
          .filter(file => file.type === 'file' && file.name?.startsWith('weather-'))
          .map(file => file.download_url)
          .filter((url): url is string => url !== null)
      }

      return []
    } catch (error) {
      console.error('Error listing weather images:', error)
      return []
    }
  }

  async cleanupOldWeatherImages(daysToKeep: number = 30): Promise<number> {
    try {
      console.log(`Cleaning up weather images older than ${daysToKeep} days...`)

      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: 'weather-images',
      })

      if (!Array.isArray(data)) {
        return 0
      }

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0]

      let deletedCount = 0

      for (const file of data) {
        if (file.type === 'file' && file.name?.startsWith('weather-')) {
          // Extract date from filename: weather-YYYY-MM-DD.png
          const dateMatch = file.name.match(/weather-(\d{4}-\d{2}-\d{2})\.png$/)
          if (dateMatch) {
            const fileDate = dateMatch[1]
            if (fileDate < cutoffDateStr) {
              console.log(`Deleting old weather image: ${file.name}`)

              await this.octokit.repos.deleteFile({
                owner: this.owner,
                repo: this.repo,
                path: file.path,
                message: `Cleanup old weather image: ${file.name}`,
                sha: file.sha
              })

              deletedCount++
            }
          }
        }
      }

      console.log(`Cleaned up ${deletedCount} old weather images`)
      return deletedCount

    } catch (error) {
      console.error('Error cleaning up old weather images:', error)
      return 0
    }
  }
}