import { NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function POST() {
  const response = await requestStoreApi('/auth/logout', { method: 'POST' });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  const nextResponse = NextResponse.json(payload, { status: response.status });
  nextResponse.cookies.set('auth_token', '', { path: '/', maxAge: 0, sameSite: 'lax' });
  nextResponse.cookies.set('store_id', '', { path: '/', maxAge: 0, sameSite: 'lax' });
  nextResponse.cookies.set('auth_token', '', { path: '/', maxAge: 0, sameSite: 'lax', domain: '.merchflow.appbrainer.tech' });
  nextResponse.cookies.set('store_id', '', { path: '/', maxAge: 0, sameSite: 'lax', domain: '.merchflow.appbrainer.tech' });
  return nextResponse;
}
