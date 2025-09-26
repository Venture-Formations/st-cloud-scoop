import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { openai, AI_PROMPTS } from '@/lib/openai'
import { ImageAnalysisResult, ImageTag } from '@/types/database'

interface IngestRequest {
  image_id: string
  source_url?: string
  license?: string
  credit?: string
  location?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: IngestRequest = await request.json()
    const { image_id, source_url, license, credit, location } = body

    // Get image record from database
    const { data: image, error: fetchError } = await supabaseAdmin
      .from('images')
      .select('*')
      .eq('id', image_id)
      .single()

    if (fetchError || !image) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      )
    }

    // Get the image URL for AI analysis
    const imageUrl = image.cdn_url

    try {
      // Analyze image with OpenAI Vision
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: AI_PROMPTS.imageAnalyzer()
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response from OpenAI Vision')
      }

      // Parse AI response
      let analysisResult: any
      try {
        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0])
        } else {
          analysisResult = JSON.parse(content.trim())
        }
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError)
        console.error('Content:', content)
        return NextResponse.json(
          { error: 'Failed to parse AI analysis results' },
          { status: 500 }
        )
      }

      // Generate embeddings for the caption
      let embeddingVector: number[] | null = null
      try {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: analysisResult.caption,
          dimensions: 768
        })
        embeddingVector = embeddingResponse.data[0].embedding
      } catch (embError) {
        console.error('Failed to generate embeddings:', embError)
        // Continue without embeddings - this is optional
      }

      // Extract image dimensions from the image file
      // Note: In a real implementation, you'd want to get these from the actual image
      // For now, we'll use placeholder values that should be replaced with actual image analysis
      const width = 1920 // Placeholder - should be extracted from image
      const height = 1080 // Placeholder - should be extracted from image
      const aspectRatio = width / height
      const orientation = aspectRatio > 1.3 ? 'landscape' : aspectRatio < 0.8 ? 'portrait' : 'square'

      // Detect faces and text (placeholder logic - would use actual image analysis)
      const facesCount = analysisResult.tags_scored?.find((tag: ImageTag) => tag.type === 'people')?.conf > 0.7 ? 1 : 0
      const hasText = analysisResult.tags_scored?.some((tag: ImageTag) => tag.name.includes('text') || tag.name.includes('sign'))

      // Extract dominant colors (placeholder)
      const dominantColors = analysisResult.tags_scored
        ?.filter((tag: ImageTag) => tag.type === 'color')
        .map((tag: ImageTag) => tag.name)
        .slice(0, 3) || []

      // Calculate safety score (based on content appropriateness)
      const safetyTag = analysisResult.tags_scored?.find((tag: ImageTag) => tag.type === 'safety')
      const safeScore = safetyTag ? safetyTag.conf : 0.95 // Default to safe

      // Prepare tags array
      const aiTags = analysisResult.top_tags || []

      // Update image record with AI analysis results
      const updateData = {
        width,
        height,
        aspect_ratio: aspectRatio,
        orientation,
        source_url,
        license,
        credit,
        location,
        faces_count: facesCount,
        has_text: hasText || false,
        dominant_colors: dominantColors,
        safe_score: safeScore,
        ai_caption: analysisResult.caption,
        ai_alt_text: analysisResult.alt_text,
        ai_tags: aiTags,
        ai_tags_scored: analysisResult.tags_scored,
        emb_caption: embeddingVector,
        updated_at: new Date().toISOString()
      }

      const { error: updateError } = await supabaseAdmin
        .from('images')
        .update(updateData)
        .eq('id', image_id)

      if (updateError) {
        console.error('Database update error:', updateError)
        return NextResponse.json(
          { error: 'Failed to save analysis results' },
          { status: 500 }
        )
      }

      // Return analysis results
      const result: ImageAnalysisResult = {
        caption: analysisResult.caption,
        alt_text: analysisResult.alt_text,
        tags_scored: analysisResult.tags_scored,
        top_tags: analysisResult.top_tags,
        width,
        height,
        aspect_ratio: aspectRatio,
        orientation,
        faces_count: facesCount,
        has_text: hasText || false,
        dominant_colors: dominantColors,
        safe_score: safeScore
      }

      return NextResponse.json(result)

    } catch (aiError) {
      console.error('OpenAI Vision API error:', aiError)
      return NextResponse.json(
        { error: 'Failed to analyze image with AI' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Image ingest API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}