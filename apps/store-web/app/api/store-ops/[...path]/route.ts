import { NextRequest, NextResponse } from 'next/server';

import { requestStoreApi } from '../../../../lib/api';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const upstreamPath = `/store-ops/${path.join('/')}${request.nextUrl.search}`;
  const bodyText = request.method === 'GET' ? undefined : await request.text();

  const response = await requestStoreApi(upstreamPath, {
    method: request.method,
    headers: bodyText ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    body: bodyText,
  });

  const payload = await response.json().catch(() => ({ ok: false, error: 'Invalid upstream response' }));
  return NextResponse.json(payload, { status: response.status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
