import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../../lib/api';

type RouteContext = {
  params: Promise<{ variantOptionId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { variantOptionId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await requestStoreApi(`/catalog/variant-options/${variantOptionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
