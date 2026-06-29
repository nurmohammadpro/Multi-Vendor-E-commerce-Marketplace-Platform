import { NextRequest, NextResponse } from 'next/server';

import { requestApi } from '@/lib/api';

export async function GET(request: NextRequest) {
  const response = await requestApi('/auth/contexts', {
    method: 'GET',
    headers: {
      Authorization: request.headers.get('authorization') || '',
    },
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
