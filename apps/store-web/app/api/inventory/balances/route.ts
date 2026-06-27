import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const locationId = query.get('locationId');
  const path = locationId ? `/inventory/balances?locationId=${encodeURIComponent(locationId)}` : '/inventory/balances';
  const response = await requestStoreApi(path);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));

  return NextResponse.json(payload, { status: response.status });
}
