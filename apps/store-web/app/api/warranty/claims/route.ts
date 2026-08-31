import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const query = new URLSearchParams();
  for (const key of ['status', 'limit', 'offset']) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }
  const path = query.toString() ? `/v1/warranty/claims?${query.toString()}` : '/v1/warranty/claims';
  const response = await requestStoreApi(path);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const response = await requestStoreApi('/v1/warranty/claims', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
