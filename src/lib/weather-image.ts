// Weather image generation using HTML/CSS to Image API

interface ImageGenerationResponse {
  url: string
}

/**
 * Generate weather image from HTML using HTML/CSS to Image API
 */
export async function generateWeatherImage(html: string): Promise<string | null> {
  const apiKey = process.env.HTML_CSS_TO_IMAGE_API_KEY

  if (!apiKey) {
    console.log('HTML_CSS_TO_IMAGE_API_KEY not set, skipping image generation')
    return null
  }

  console.log('API key found, length:', apiKey.length)

  try {
    // Prepare the HTML for image generation
    const imageHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: Arial, sans-serif;
              background-color: #ffffff;
              width: 500px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: center;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <h2 style="color: #2c3e50; margin-bottom: 20px;">3-Day Weather Forecast</h2>
          ${html}
          <p style="font-size: 11px; color: #666; text-align: center; margin-top: 20px;">
            Forecast provided by the National Weather Service
          </p>
        </body>
      </html>
    `

    console.log('Generating weather image...')

    const response = await fetch('https://hcti.io/v1/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        html: imageHtml,
        css: '',
        width: 500,
        height: 350,
        device_scale_factor: 2,
        format: 'png'
      })
    })

    console.log('Image API response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Image API error response:', errorText)
      throw new Error(`Image API failed: ${response.status} - ${errorText}`)
    }

    const result: ImageGenerationResponse = await response.json()
    console.log('Weather image generated successfully:', result.url)

    return result.url

  } catch (error) {
    console.error('Weather image generation failed:', error)
    return null
  }
}