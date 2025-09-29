import { ImageAnnotatorClient } from '@google-cloud/vision'
import { GoogleAuth } from 'google-auth-library'

interface VisionSearchResult {
  source_url: string
  source_name: string
  title?: string
  creator?: string
  license_info?: string
  similarity_score?: number
  thumbnail_url?: string
}

export class GoogleVisionService {
  private visionClient: ImageAnnotatorClient
  private auth: GoogleAuth

  /**
   * Safely parse Google Cloud credentials JSON, handling base64 and escaped formats
   */
  private parseCredentialsJson(credentialsString: string) {
    try {
      // Strategy 1: Check if it's base64 encoded (preferred for deployment)
      if (credentialsString.match(/^[A-Za-z0-9+/]+=*$/)) {
        console.log('Detected base64 credentials, decoding...')
        const decoded = Buffer.from(credentialsString, 'base64').toString('utf8')
        const parsed = JSON.parse(decoded)
        console.log('Successfully parsed base64-encoded credentials')
        return parsed
      }

      // Strategy 2: Direct JSON parse (for properly formatted JSON)
      try {
        const parsed = JSON.parse(credentialsString)
        console.log('Successfully parsed direct JSON credentials')
        return parsed
      } catch {
        // Continue to next strategy
      }

      // Strategy 3: Fix escaped newlines and parse
      const cleaned = credentialsString.replace(/\\n/g, '\n')
      const parsed = JSON.parse(cleaned)
      console.log('Successfully parsed credentials after newline fix')
      return parsed

    } catch (error) {
      console.error('All credential parsing strategies failed:', error instanceof Error ? error.message : 'Unknown error')
      throw new Error(`Google Cloud credentials parsing failed. Format the credentials as base64 or properly escaped JSON. Error: ${error instanceof Error ? error.message : 'Unknown'}`)
    }
  }

  constructor() {
    let credentials = undefined

    // Try to parse credentials if available
    if (process.env.GOOGLE_CLOUD_CREDENTIALS_JSON) {
      try {
        credentials = this.parseCredentialsJson(process.env.GOOGLE_CLOUD_CREDENTIALS_JSON)
        console.log('Successfully loaded Google Cloud credentials')
      } catch (error) {
        console.error('Failed to parse Google Cloud credentials:', error instanceof Error ? error.message : 'Unknown error')
        // Continue without credentials - will fall back to other auth methods
      }
    }

    // Initialize Google Cloud authentication with fallback options
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      credentials: credentials,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
    })

    this.visionClient = new ImageAnnotatorClient({
      auth: this.auth,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
    })
  }

  /**
   * Perform reverse image search using Google Cloud Vision API
   */
  async reverseImageSearch(imageUrl: string): Promise<VisionSearchResult[]> {
    try {
      console.log(`Starting Google Vision reverse search for: ${imageUrl}`)

      // Step 1: Use Vision API to analyze the image
      const imageAnalysis = await this.analyzeImage(imageUrl)

      // Step 2: Use web detection to find similar images
      const webDetection = await this.detectWebImages(imageUrl)

      // Step 3: Combine and process results
      const results = this.processVisionResults(webDetection, imageAnalysis)

      console.log(`Google Vision found ${results.length} results`)
      return results

    } catch (error) {
      console.error('Google Vision API error:', error)
      throw new Error(`Vision API failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Analyze image content using Vision API
   */
  private async analyzeImage(imageUrl: string) {
    const [result] = await this.visionClient.annotateImage({
      image: { source: { imageUri: imageUrl } },
      features: [
        { type: 'LABEL_DETECTION', maxResults: 10 },
        { type: 'TEXT_DETECTION' },
        { type: 'LOGO_DETECTION' },
        { type: 'SAFE_SEARCH_DETECTION' },
        { type: 'IMAGE_PROPERTIES' }
      ]
    })

    return {
      labels: result.labelAnnotations || [],
      text: result.textAnnotations || [],
      logos: result.logoAnnotations || [],
      safeSearch: result.safeSearchAnnotation,
      properties: result.imagePropertiesAnnotation
    }
  }

  /**
   * Detect web images and sources using Vision API
   */
  private async detectWebImages(imageUrl: string) {
    const [result] = await this.visionClient.annotateImage({
      image: { source: { imageUri: imageUrl } },
      features: [
        { type: 'WEB_DETECTION', maxResults: 20 }
      ]
    })

    return result.webDetection
  }

  /**
   * Process Vision API results into our standard format
   */
  private processVisionResults(webDetection: any, imageAnalysis: any): VisionSearchResult[] {
    const results: VisionSearchResult[] = []

    // Process web entities (potential sources)
    if (webDetection?.webEntities) {
      for (const entity of webDetection.webEntities) {
        if (entity.score && entity.score > 0.5) {
          // Try to find corresponding pages
          const relatedPages = webDetection.pagesWithMatchingImages || []
          const matchingPage = relatedPages.find((page: any) =>
            page.pageTitle?.toLowerCase().includes(entity.description?.toLowerCase() || '')
          )

          if (matchingPage) {
            const sourceInfo = this.extractSourceInfo(matchingPage.url, matchingPage.pageTitle)
            results.push({
              source_url: matchingPage.url,
              source_name: sourceInfo.source,
              title: matchingPage.pageTitle,
              creator: sourceInfo.creator,
              license_info: sourceInfo.license,
              similarity_score: entity.score,
              thumbnail_url: matchingPage.fullMatchingImages?.[0]?.url
            })
          }
        }
      }
    }

    // Process pages with matching images
    if (webDetection?.pagesWithMatchingImages) {
      for (const page of webDetection.pagesWithMatchingImages.slice(0, 10)) {
        if (!results.find(r => r.source_url === page.url)) {
          const sourceInfo = this.extractSourceInfo(page.url, page.pageTitle)
          results.push({
            source_url: page.url,
            source_name: sourceInfo.source,
            title: page.pageTitle,
            creator: sourceInfo.creator,
            license_info: sourceInfo.license,
            similarity_score: 0.7, // Default score for page matches
            thumbnail_url: page.fullMatchingImages?.[0]?.url
          })
        }
      }
    }

    // Process visually similar images
    if (webDetection?.visuallySimilarImages) {
      for (const similar of webDetection.visuallySimilarImages.slice(0, 5)) {
        // Try to extract source from image URL
        const sourceInfo = this.extractSourceInfo(similar.url, '')
        if (sourceInfo.source !== 'Unknown Source') {
          results.push({
            source_url: similar.url,
            source_name: sourceInfo.source,
            license_info: sourceInfo.license,
            similarity_score: 0.6,
            thumbnail_url: similar.url
          })
        }
      }
    }

    // Sort by similarity score and remove duplicates
    const uniqueResults = results.filter((result, index, self) =>
      index === self.findIndex(r => r.source_url === result.source_url)
    )

    return uniqueResults.sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0))
  }

  /**
   * Extract source information from URL and title
   */
  private extractSourceInfo(url: string, title: string) {
    let source = 'Unknown Source'
    let license = ''
    let creator = ''

    try {
      const domain = new URL(url).hostname.toLowerCase()

      // Detect stock photo sources
      if (domain.includes('shutterstock')) {
        source = 'Shutterstock'
        license = 'Licensed Stock Photo'
      } else if (domain.includes('gettyimages')) {
        source = 'Getty Images'
        license = 'Licensed Stock Photo'
      } else if (domain.includes('adobe') && domain.includes('stock')) {
        source = 'Adobe Stock'
        license = 'Licensed Stock Photo'
      } else if (domain.includes('istock')) {
        source = 'iStock'
        license = 'Licensed Stock Photo'
      } else if (domain.includes('unsplash')) {
        source = 'Unsplash'
        license = 'Free License (Unsplash)'
      } else if (domain.includes('pexels')) {
        source = 'Pexels'
        license = 'Free License (Pexels)'
      } else if (domain.includes('pixabay')) {
        source = 'Pixabay'
        license = 'Free License (Pixabay)'
      } else if (domain.includes('flickr')) {
        source = 'Flickr'
        license = 'Various Licenses'
      } else {
        source = domain.replace('www.', '').replace('.com', '').replace('.org', '')
      }

      // Extract creator from title
      if (title) {
        const creatorPatterns = [
          /by\s+([^-|,]+)/i,
          /photo\s+by\s+([^-|,]+)/i,
          /image\s+by\s+([^-|,]+)/i,
          /credit:\s*([^-|,]+)/i
        ]

        for (const pattern of creatorPatterns) {
          const match = title.match(pattern)
          if (match && match[1]) {
            creator = match[1].trim()
            break
          }
        }
      }

    } catch (error) {
      console.error('Error extracting source info:', error)
    }

    return { source, license, creator }
  }

  /**
   * Get project configuration info
   */
  getConfig() {
    return {
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      hasCredentials: !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_CREDENTIALS_JSON),
      isConfigured: !!(process.env.GOOGLE_CLOUD_PROJECT_ID && (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_CREDENTIALS_JSON))
    }
  }
}