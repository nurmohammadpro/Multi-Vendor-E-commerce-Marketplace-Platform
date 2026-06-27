import { NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function GET() {
  const response = await requestStoreApi('/billing/plans');
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
