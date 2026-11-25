import { NextResponse } from 'next/server';

import { requestAdminApi } from '../../../../../../lib/api';

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const body = await _request.json().catch(() => ({}));
  const response = await requestAdminApi(`/admin/billing/plans/${planId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const response = await requestAdminApi(`/admin/billing/plans/${planId}`, { method: 'DELETE' });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
