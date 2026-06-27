import { NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../../lib/api';

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { invoiceId } = await context.params;
  const response = await requestStoreApi(`/billing/invoices/${invoiceId}`);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
