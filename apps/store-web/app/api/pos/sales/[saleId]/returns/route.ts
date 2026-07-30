import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../../../lib/api';

type RouteContext = {
  params: Promise<{
    saleId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { saleId } = await context.params;
  const response = await requestStoreApi(`/pos/sales/${saleId}/returns`, {
    method: 'GET',
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));

  return NextResponse.json(payload, { status: response.status });
}

export async function POST(request: Request, context: RouteContext) {
  const { saleId } = await context.params;
  const body = await request.json();
  const response = await requestStoreApi(`/pos/sales/${saleId}/returns`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));

  return NextResponse.json(payload, { status: response.status });
}
