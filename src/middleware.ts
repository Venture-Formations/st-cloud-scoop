import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''

  // Check if this is the events subdomain
  const isEventsSubdomain = hostname.startsWith('events.')

  if (isEventsSubdomain) {
    // Redirect root to events view page
    if (request.nextUrl.pathname === '/') {
      return NextResponse.redirect(new URL('/events/view', request.url))
    }

    // Block dashboard routes
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/events/view', request.url))
    }

    // Block auth routes (no login on events subdomain)
    if (request.nextUrl.pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/events/view', request.url))
    }
  }

  // Allow all other requests
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
