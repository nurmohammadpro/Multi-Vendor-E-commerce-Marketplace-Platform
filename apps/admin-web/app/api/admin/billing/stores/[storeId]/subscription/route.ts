import { NextRequest, NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../../../../lib/api';

type RouteContext = {
  params: Promise<{ storeId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { storeId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await requestAdminApi(`/admin/billing/stores/${storeId}/subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
