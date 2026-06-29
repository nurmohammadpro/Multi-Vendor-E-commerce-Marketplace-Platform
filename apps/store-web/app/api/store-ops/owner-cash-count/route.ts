import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);

  const response = await requestStoreApi('/store-ops/owner-cash-count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });

  const body = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(body, { status: response.status });
}
