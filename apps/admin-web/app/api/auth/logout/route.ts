import { NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../lib/api';

export async function POST() {
  const response = await requestAdminApi('/auth/logout', { method: 'POST' });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  const nextResponse = NextResponse.json(payload, { status: response.status });
  nextResponse.cookies.set('auth_token', '', { path: '/', maxAge: 0, sameSite: 'lax' });
  nextResponse.cookies.set('store_id', '', { path: '/', maxAge: 0, sameSite: 'lax' });
  nextResponse.cookies.set('auth_token', '', { path: '/', maxAge: 0, sameSite: 'lax', domain: '.marketone.appbrainer.tech' });
  nextResponse.cookies.set('store_id', '', { path: '/', maxAge: 0, sameSite: 'lax', domain: '.marketone.appbrainer.tech' });
  return nextResponse;
}
