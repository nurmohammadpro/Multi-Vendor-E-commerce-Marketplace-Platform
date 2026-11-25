import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function resolveCookieDomain(hostname: string) {
  const explicit = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
  if (explicit) return explicit.startsWith('.') ? explicit : `.${explicit}`;
  if (hostname.endsWith('merchflow.appbrainer.tech')) return '.merchflow.appbrainer.tech';
  return undefined;
}

export function middleware(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const storeId = request.nextUrl.searchParams.get('storeId');

  if (!token) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.searchParams.delete('token');
  url.searchParams.delete('storeId');

  const response = NextResponse.redirect(url);
  const domain = resolveCookieDomain(request.nextUrl.hostname);
  response.cookies.set('auth_token', token, {
    path: '/',
    maxAge: 86400,
    sameSite: 'lax',
    ...(domain ? { domain } : {}),
  });
  if (storeId) {
    response.cookies.set('store_id', storeId, {
      path: '/',
      maxAge: 86400,
      sameSite: 'lax',
      ...(domain ? { domain } : {}),
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api).*)'],
};
