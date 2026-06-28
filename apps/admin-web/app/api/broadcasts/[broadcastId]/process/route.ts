import { NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../../lib/api';

type RouteContext = {
  params: Promise<{ broadcastId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { broadcastId } = await context.params;
  const response = await requestAdminApi(`/admin/ops/broadcasts/${broadcastId}/process`, { method: 'POST' });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
