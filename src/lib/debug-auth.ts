/**
 * Centralized authentication for debug routes
 * Prevents unauthorized access to debug endpoints in production
 */

import { NextResponse } from 'next/server'

export interface DebugAuthResult {
  authorized: boolean
  response?: NextResponse
}

/**
 * Validates debug route access using secret token
 * @param request - The incoming request object
 * @returns Authorization result with optional 401 response
 */
export function validateDebugAuth(request: Request): DebugAuthResult {
  // In development, allow all requests
  if (process.env.NODE_ENV === 'development') {
    return { authorized: true }
  }

  // In production, require DEBUG_SECRET
  const authHeader = request.headers.get('authorization')
  const debugSecret = process.env.DEBUG_SECRET

  // Check if secret is configured
  if (!debugSecret) {
    console.error('DEBUG_SECRET not configured - debug routes are blocked')
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: 'Debug routes are not available',
          message: 'DEBUG_SECRET not configured'
        },
        { status: 503 }
      )
    }
  }

  // Validate authorization header
  const expectedAuth = `Bearer ${debugSecret}`
  if (!authHeader || authHeader !== expectedAuth) {
    console.warn('Unauthorized debug route access attempt', {
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
      url: request.url
    })

    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Valid authorization header required'
        },
        { status: 401 }
      )
    }
  }

  return { authorized: true }
}

/**
 * Validates query parameter secret (for GET requests)
 * @param request - The incoming request object
 * @returns Authorization result with optional 401 response
 */
export function validateDebugSecret(request: Request): DebugAuthResult {
  // In development, allow all requests
  if (process.env.NODE_ENV === 'development') {
    return { authorized: true }
  }

  const { searchParams } = new URL(request.url)
  const providedSecret = searchParams.get('secret')
  const debugSecret = process.env.DEBUG_SECRET

  if (!debugSecret) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Debug routes not configured' },
        { status: 503 }
      )
    }
  }

  if (providedSecret !== debugSecret) {
    console.warn('Unauthorized debug route access attempt via query param', {
      ip: request.headers.get('x-forwarded-for'),
      url: request.url
    })

    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Valid secret parameter required: ?secret=YOUR_SECRET'
        },
        { status: 401 }
      )
    }
  }

  return { authorized: true }
}
