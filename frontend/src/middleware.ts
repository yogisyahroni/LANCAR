import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * SECURITY: Server-side route protection middleware (S3-MW-01)
 *
 * This runs on the Edge before React renders anything — it is NOT bypassable
 * via DevTools or Zustand store manipulation because it runs server-side.
 *
 * Rules:
 * 1. All (portal) routes require an active session cookie.
 * 2. /analytics and /feature-flags are REMOVED from customer portal (admin-only).
 * 3. Unauthenticated users on protected routes are redirected to /login.
 */

// Routes that require authentication (customer portal)
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/orders',
  '/profil',
  '/resi',
  '/laporan',
  '/disputes',
  '/alamat',
  '/voucher',
  '/notifikasi',
];

// PUBLIC ROUTES (no session required): '/', '/cek-resi', '/track/*' and the
// auth pages listed in the matcher below. Do NOT add them to PROTECTED_PREFIXES.


// These were mistakenly added to customer portal — redirect them away
// They belong in the admin-dashboard, not here
const ADMIN_ONLY_PATHS = ['/analytics', '/feature-flags'];

// Session cookie names used by auth-service
const SESSION_COOKIE_NAMES = ['tembus_web_session', 'tembus_session', 'session', 'customer_session'];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some(
    (name) => !!request.cookies.get(name)?.value
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Block admin-only pages from customer portal entirely
  if (ADMIN_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    // Redirect to dashboard — these pages don't belong in customer portal
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Check if path requires authentication
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (isProtected && !hasSessionCookie(request)) {
    // Preserve the intended destination for post-login redirect
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Add security headers to all responses
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self)'
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - /track/* (public tracking pages, no auth required)
     * - /login, /daftar, /otp-verify, /google-callback, /forgot-pin (public auth pages)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|track/|login|daftar|otp-verify|google-callback|forgot-pin).*)',
  ],
};
