import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../../lib/api';

export async function GET() {
  const response = await requestStoreApi('/pos/returns/pending-approvals');
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
