import { NextRequest, NextResponse } from 'next/server';

import { requestApi } from '@/lib/api';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const response = await requestApi('/auth/select-context', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('authorization') || '',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
