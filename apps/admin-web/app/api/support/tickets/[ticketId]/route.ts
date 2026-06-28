import { NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../../lib/api';

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { ticketId } = await context.params;
  const response = await requestAdminApi(`/admin/support/tickets/${ticketId}`);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
