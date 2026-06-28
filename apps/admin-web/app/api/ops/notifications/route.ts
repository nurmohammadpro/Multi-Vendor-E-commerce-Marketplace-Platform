import { NextRequest, NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../lib/api';

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status');
  const path = status ? `/admin/ops/notifications?status=${encodeURIComponent(status)}` : '/admin/ops/notifications';
  const response = await requestAdminApi(path);
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
