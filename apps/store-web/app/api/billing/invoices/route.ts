import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams.toString();
  const response = await requestStoreApi(params ? `/billing/invoices?${params}` : '/billing/invoices');
  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}
