import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai'

interface TagSuggestion {
  formatted_tag: string
  display_name: string
  confidence: number
}

export async function POST(request: NextRequest) {
  try {
    const { input } = await request.json()

    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { error: 'Input text is required' },
        { status: 400 }
      )
    }

    const prompt = `Given the user input "${input}", suggest 5-8 relevant image tags in the proper format.

Return ONLY a JSON array of tag suggestions with this exact structure:
[
  {
    "formatted_tag": "object_football",
    "display_name": "Object: Football",
    "confidence": 0.95
  },
  {
    "formatted_tag": "sport_american_football",
    "display_name": "Sport: American Football",
    "confidence": 0.90
  }
]

Tag formatting rules:
- Use format: "type_name" (e.g., "object_car", "scene_outdoor", "people_group")
- Types: object, scene, people, sport, activity, color, style, theme, location, weather, time, mood
- Names: lowercase, underscores for spaces, descriptive but concise
- Display names: Proper case with colon separator (e.g., "Object: Car")
- Confidence: 0.0-1.0 based on relevance to input

For input "${input}", think of:
1. Direct matches (if "football" → "object_football", "sport_american_football")
2. Related concepts (if "football" → "sport_team_sport", "activity_playing")
3. Context variations (if "football" → "scene_sports_field", "object_ball")
4. Broader categories (if "football" → "people_athletes", "activity_recreation")
5. Mood/emotion context (if "celebration" → "mood_joyful", "mood_energetic")

Mood categories include: happy, sad, energetic, calm, serious, playful, contemplative, excited, peaceful, dramatic, romantic, mysterious, nostalgic, professional, casual, festive, solemn

Return valid JSON array only, no other text.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.3
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json(
        { error: 'No response from AI' },
        { status: 500 }
      )
    }

    try {
      // Parse AI response
      const suggestions: TagSuggestion[] = JSON.parse(content.trim())

      // Validate response format
      if (!Array.isArray(suggestions)) {
        throw new Error('Response is not an array')
      }

      // Validate each suggestion
      const validSuggestions = suggestions.filter(suggestion =>
        suggestion.formatted_tag &&
        suggestion.display_name &&
        typeof suggestion.confidence === 'number'
      )

      // Add the typed word itself as a suggestion in proper format
      const inputFormatted = input.toLowerCase().replace(/\s+/g, '_')
      const directSuggestion = {
        formatted_tag: `object_${inputFormatted}`,
        display_name: `Object: ${input}`,
        confidence: 0.95
      }

      // Add direct suggestion at the beginning if it's not already included
      const finalSuggestions = [directSuggestion, ...validSuggestions.filter(s =>
        s.formatted_tag !== directSuggestion.formatted_tag
      )]

      return NextResponse.json({ suggestions: finalSuggestions })

    } catch (parseError) {
      console.error('Failed to parse AI tag suggestions:', parseError)
      console.error('AI response:', content)

      // Fallback: create multiple suggestions from input
      const inputFormatted = input.toLowerCase().replace(/\s+/g, '_')
      const fallbackSuggestions = [
        {
          formatted_tag: `object_${inputFormatted}`,
          display_name: `Object: ${input}`,
          confidence: 0.95
        },
        {
          formatted_tag: `scene_${inputFormatted}`,
          display_name: `Scene: ${input}`,
          confidence: 0.8
        },
        {
          formatted_tag: `activity_${inputFormatted}`,
          display_name: `Activity: ${input}`,
          confidence: 0.7
        }
      ]

      return NextResponse.json({
        suggestions: fallbackSuggestions,
        fallback: true
      })
    }

  } catch (error) {
    console.error('Tag suggestion API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}