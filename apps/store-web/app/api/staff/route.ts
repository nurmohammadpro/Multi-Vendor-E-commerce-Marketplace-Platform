import { NextResponse } from 'next/server';

import { getStoreApiConfig, requestStoreApi } from '../../../lib/api';

export async function GET() {
  const { storeId } = getStoreApiConfig();
  const response = await requestStoreApi(`/stores/${storeId}/staff`);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
