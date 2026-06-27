import { NextRequest, NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../../lib/api';

type RouteContext = {
  params: Promise<{ membershipId: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const { membershipId } = await context.params;
  const response = await requestAdminApi(`/admin/admins/${membershipId}/promote-owner`, {
    method: 'POST',
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
