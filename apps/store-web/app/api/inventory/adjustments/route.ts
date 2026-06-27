import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const status = query.get('status');
  const path = status ? `/inventory/adjustments?status=${encodeURIComponent(status)}` : '/inventory/adjustments';
  const response = await requestStoreApi(path);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));

  return NextResponse.json(payload, { status: response.status });
}
