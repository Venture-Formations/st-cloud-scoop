import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''

  // Check subdomain types
  const isEventsSubdomain = hostname.startsWith('events.')
  const isAdminSubdomain = hostname.startsWith('admin.')
  const isMainDomain = !isEventsSubdomain && !isAdminSubdomain

  // Events subdomain - public events pages only
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

  // Admin subdomain - dashboard and auth only
  if (isAdminSubdomain) {
    // Redirect root to dashboard
    if (request.nextUrl.pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Block public events pages (except API routes)
    if (request.nextUrl.pathname.startsWith('/events') && !request.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Main domain - redirect to admin subdomain
  if (isMainDomain) {
    // Redirect to admin subdomain
    const adminUrl = new URL(request.url)
    adminUrl.hostname = `admin.${hostname}`
    return NextResponse.redirect(adminUrl)
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
