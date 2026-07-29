import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const params: Record<string, string> = {};
  for (const key of ['search', 'page', 'limit']) {
    const v = searchParams.get(key);
    if (v) params[key] = v;
  }
  const qs = new URLSearchParams(params).toString();
  const response = await requestStoreApi(`/pos/sales-report?${qs}`);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));

  return NextResponse.json(payload, { status: response.status });
}
