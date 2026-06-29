import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../../lib/api';

type RouteContext = {
  params: Promise<{ productId: string }>;
};

export async function GET(_: NextRequest, context: RouteContext) {
  const { productId } = await context.params;
  const response = await requestStoreApi(`/catalog/products/${productId}`);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  const { productId } = await context.params;
  const response = await requestStoreApi(`/catalog/products/${productId}`, {
    method: 'DELETE',
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { productId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await requestStoreApi(`/catalog/products/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
