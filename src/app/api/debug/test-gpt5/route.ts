import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { callOpenAI } from '@/lib/openai'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🤖 Testing GPT-5 availability...')

    const testPrompt = "Respond with exactly this: 'GPT-5 is working'"

    try {
      const result = await callOpenAI(testPrompt, 100, 0.1)
      console.log('GPT-5 test successful:', result)

      return NextResponse.json({
        success: true,
        model: 'gpt-5',
        response: result,
        message: 'GPT-5 is available and working'
      })
    } catch (openaiError) {
      console.error('GPT-5 test failed:', openaiError)

      return NextResponse.json({
        success: false,
        model: 'gpt-5',
        error: openaiError instanceof Error ? openaiError.message : 'Unknown OpenAI error',
        message: 'GPT-5 test failed - check if model is available'
      })
    }

  } catch (error) {
    console.error('GPT-5 debug endpoint error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}