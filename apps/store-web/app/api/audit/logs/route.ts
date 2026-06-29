import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams.toString();
  const path = params ? `/audit/store-logs?${params}` : '/audit/store-logs';
  const response = await requestStoreApi(path);
  const payload = await response.json().catch(() => ({ error: 'Invalid upstream response' }));

  return NextResponse.json(payload, { status: response.status });
}
