import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../../lib/api';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const params = new URLSearchParams();

  for (const key of ['q', 'barcode', 'limit']) {
    const value = query.get(key);
    if (value) {
      params.set(key, value);
    }
  }

  const path = params.toString() ? `/catalog/skus/search?${params.toString()}` : '/catalog/skus/search';
  const response = await requestStoreApi(path);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));

  return NextResponse.json(payload, { status: response.status });
}
