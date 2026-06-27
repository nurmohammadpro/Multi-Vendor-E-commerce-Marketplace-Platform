import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status');
  const path = status ? `/catalog/products?status=${encodeURIComponent(status)}` : '/catalog/products';
  const response = await requestStoreApi(path);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const response = await requestStoreApi('/catalog/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
