import { NextRequest, NextResponse } from 'next/server';

import { getStoreApiConfig, requestStoreApi } from '../../../../lib/api';

type RouteContext = {
  params: Promise<{ membershipId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { membershipId } = await context.params;
  const { storeId } = getStoreApiConfig();
  const body = await request.json().catch(() => ({}));
  const response = await requestStoreApi(`/stores/${storeId}/staff/${membershipId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
