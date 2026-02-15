import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/cron', '/_next', '/favicon.ico', '/manifest.json', '/sw.js'];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public paths
    if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // Check for auth cookie
    const authCookie = request.cookies.get('tradesk-auth');
    if (authCookie?.value === getExpectedToken()) {
        return NextResponse.next();
    }

    // Redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
}

function getExpectedToken(): string {
    // Deterministic token derived from the password hash env var
    // This avoids needing crypto in middleware edge runtime
    const hash = process.env.TRADESK_PASSWORD_HASH || '';
    return hash.slice(0, 32) + '-authed';
}

export const config = {
    matcher: [
        /*
         * Match all paths except static files
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
