import { NextRequest, NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../lib/api';

export async function GET() {
  const response = await requestAdminApi('/platform/settings');
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const response = await requestAdminApi('/platform/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
