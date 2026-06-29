import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const idempotencyKey = request.headers.get('x-idempotency-key');
  const response = await requestStoreApi('/pos/sales', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));

  return NextResponse.json(payload, { status: response.status });
}
