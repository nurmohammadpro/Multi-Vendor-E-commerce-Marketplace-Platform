import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../../../lib/api';

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { invoiceId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await requestStoreApi(`/billing/invoices/${invoiceId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
