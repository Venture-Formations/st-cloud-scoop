import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// AI Prompts as specified in PRD
export const AI_PROMPTS = {
  contentEvaluator: (post: { title: string; description: string; content?: string }) => `
You are evaluating a news article for inclusion in a local St. Cloud, Minnesota newsletter. Rate the article on three dimensions using a 1-10 scale:

1. INTEREST LEVEL (1-10): How compelling and engaging is this story for general readers?
2. LOCAL RELEVANCE (1-10): How relevant is this to St. Cloud, Minnesota residents specifically?
3. COMMUNITY IMPACT (1-10): How significant is the potential impact on the local community?

Article Title: ${post.title}
Article Description: ${post.description || 'No description available'}
Article Content: ${post.content ? post.content.substring(0, 1000) + '...' : 'No content available'}

IMPORTANT: You must respond with ONLY valid JSON. Do not include any text before or after the JSON.

{
  "interest_level": <number 1-10>,
  "local_relevance": <number 1-10>,
  "community_impact": <number 1-10>,
  "reasoning": "<detailed explanation of your scoring>"
}`,

  topicDeduper: (posts: Array<{ title: string; description: string }>) => `
You are identifying duplicate stories from multiple news sources. Review these articles and group them by topic if they cover the same story. For each group, select the article with the most comprehensive content.

Articles to analyze:
${posts.map((post, i) => `${i + 1}. ${post.title}\n   ${post.description || 'No description'}`).join('\n\n')}

Respond with valid JSON in this exact format:
{
  "groups": [
    {
      "topic_signature": "<brief topic description>",
      "primary_article_index": <number>,
      "duplicate_indices": [<array of numbers>],
      "similarity_explanation": "<why these are duplicates>"
    }
  ],
  "unique_articles": [<array of article indices that are unique>]
}`,

  newsletterWriter: (post: { title: string; description: string; content?: string; source_url?: string }) => `
Convert this news article into a concise, engaging newsletter item. Write between 40-75 words in a conversational tone suitable for local newsletter readers.

Original Article:
Title: ${post.title}
Description: ${post.description || 'No description available'}
Content: ${post.content ? post.content.substring(0, 1500) + '...' : 'No additional content'}

Requirements:
- 40-75 words exactly
- Engaging, conversational tone
- Include key facts and local relevance
- End with call-to-action if appropriate

Respond with valid JSON in this exact format:
{
  "headline": "<engaging headline for newsletter>",
  "content": "<40-75 word newsletter content>",
  "word_count": <exact word count>
}`,

  factChecker: (newsletterContent: string, originalContent: string) => `
Fact-check this newsletter content against the original source material. Score accuracy on a scale of 0-30 (30 being perfectly accurate).

Newsletter Content:
${newsletterContent}

Original Source Material:
${originalContent.substring(0, 2000)}

Check for:
- Factual accuracy (0-10 points)
- Context preservation (0-10 points)
- No misleading claims (0-10 points)

Minimum passing score: 20/30

Respond with valid JSON in this exact format:
{
  "score": <number 0-30>,
  "factual_accuracy": <number 0-10>,
  "context_preservation": <number 0-10>,
  "no_misleading_claims": <number 0-10>,
  "details": "<specific issues found or confirmation of accuracy>",
  "passed": <boolean>
}`,

  subjectLineGenerator: (articles: Array<{ headline: string; content: string }>) => `
Generate a compelling email subject line for this newsletter containing these articles. The subject line must be 39 characters or less.

Articles in this newsletter:
${articles.map((article, i) => `${i + 1}. ${article.headline}\n   ${article.content.substring(0, 100)}...`).join('\n\n')}

Requirements:
- Maximum 39 characters
- Engaging and clickable
- Reflects main news themes
- Appropriate for St. Cloud, MN audience

Respond with valid JSON in this exact format:
{
  "subject_line": "<subject line>",
  "character_count": <exact character count>
}`
}

export async function callOpenAI(prompt: string, maxTokens = 1000) {
  try {
    console.log('Calling OpenAI API...')

    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // Use higher quality model
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3,
      }, {
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response from OpenAI')
      }

      console.log('OpenAI response received')

      // Try to parse as JSON, fallback to raw content
      try {
        // Clean the content - remove any text before/after JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0])
        } else {
          return JSON.parse(content)
        }
      } catch (parseError) {
        console.warn('Failed to parse OpenAI response as JSON:', content)
        console.warn('Parse error:', parseError)
        return { raw: content }
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message)
    }
    throw error
  }
}