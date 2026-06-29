import { NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../../lib/api';

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { ticketId } = await context.params;
  const response = await requestStoreApi(`/support/tickets/${ticketId}`);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
