import { NextRequest, NextResponse } from 'next/server';

import { requestApi } from '@/lib/api';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const response = await requestApi('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, message: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
