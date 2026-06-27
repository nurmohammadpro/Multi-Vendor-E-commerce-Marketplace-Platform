import { NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../../../lib/api';

type RouteContext = {
  params: Promise<{ productId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { productId } = await context.params;
  const response = await requestStoreApi(`/catalog/products/${productId}/variants`);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
