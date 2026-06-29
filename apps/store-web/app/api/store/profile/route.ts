import { NextRequest, NextResponse } from 'next/server';

import { getStoreApiConfig, requestStoreApi } from '../../../../lib/api';

export async function GET() {
  const { storeId } = await getStoreApiConfig();
  if (!storeId) {
    return NextResponse.json({ ok: false, error: 'Store API is not configured' }, { status: 503 });
  }

  const response = await requestStoreApi(`/stores/${storeId}`);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}

export async function PATCH(request: NextRequest) {
  const { storeId } = await getStoreApiConfig();
  if (!storeId) {
    return NextResponse.json({ ok: false, error: 'Store API is not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const response = await requestStoreApi(`/stores/${storeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
