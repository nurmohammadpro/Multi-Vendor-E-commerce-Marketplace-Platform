import { NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function POST() {
  const response = await requestStoreApi('/catalog/starter-template', {
    method: 'POST',
  });
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
