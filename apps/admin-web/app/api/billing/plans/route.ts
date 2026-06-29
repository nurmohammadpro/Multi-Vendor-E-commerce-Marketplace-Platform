import { NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../lib/api';

export async function GET() {
  const response = await requestAdminApi('/admin/billing/plans');
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
