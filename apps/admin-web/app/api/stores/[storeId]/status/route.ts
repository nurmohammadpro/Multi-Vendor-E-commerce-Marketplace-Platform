import { NextRequest, NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../../lib/api';

type RouteContext = {
  params: Promise<{ storeId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { storeId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await requestAdminApi(`/admin/stores/${storeId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
