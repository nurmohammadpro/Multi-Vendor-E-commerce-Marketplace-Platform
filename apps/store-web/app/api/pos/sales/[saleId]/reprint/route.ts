import { NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../../../lib/api';

type RouteContext = {
  params: Promise<{
    saleId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { saleId } = await context.params;
  const response = await requestStoreApi(`/pos/sales/${saleId}/reprint`, {
    method: 'POST',
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));

  return NextResponse.json(payload, { status: response.status });
}
