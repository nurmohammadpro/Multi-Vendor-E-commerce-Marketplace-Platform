import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const query = new URLSearchParams();

  for (const key of ['q', 'barcode', 'limit']) {
    const value = search.get(key);
    if (value) {
      query.set(key, value);
    }
  }

  const path = query.toString() ? `/pos/catalog/search?${query.toString()}` : '/pos/catalog/search';
  const response = await requestStoreApi(path);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));

  return NextResponse.json(payload, { status: response.status });
}
