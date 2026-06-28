import { NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../../lib/api';

export async function POST() {
  const response = await requestAdminApi('/admin/ops/notifications/process', { method: 'POST' });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
