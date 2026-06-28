import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const storeId = request.nextUrl.searchParams.get('storeId');

  if (!token) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.searchParams.delete('token');
  url.searchParams.delete('storeId');

  const response = NextResponse.redirect(url);
  response.cookies.set('auth_token', token, {
    path: '/',
    maxAge: 86400,
    sameSite: 'lax',
  });
  if (storeId) {
    response.cookies.set('store_id', storeId, {
      path: '/',
      maxAge: 86400,
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api).*)'],
};
