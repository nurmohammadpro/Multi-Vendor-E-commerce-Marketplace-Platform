import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../../../lib/api';

type RouteContext = {
  params: Promise<{ exchangeId: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const { exchangeId } = await context.params;
  const response = await requestStoreApi(`/pos/exchanges/${exchangeId}/reprint`, {
    method: 'POST',
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));

  return NextResponse.json(payload, { status: response.status });
}
