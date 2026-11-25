import { NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../../../lib/api';

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { ticketId } = await context.params;
  const body = await request.json();
  const response = await requestAdminApi(`/admin/support/tickets/${ticketId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
