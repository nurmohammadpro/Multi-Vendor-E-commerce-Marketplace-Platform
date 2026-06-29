import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

import { getStoreApiConfig, requestStoreApi } from '../../../lib/api';

export async function GET() {
  const { storeId } = await getStoreApiConfig();
  const response = await requestStoreApi(`/stores/${storeId}/staff`);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}

export async function POST(request: NextRequest) {
  const { storeId } = await getStoreApiConfig();
  const body = await request.json().catch(() => ({}));
  const response = await requestStoreApi(`/stores/${storeId}/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
