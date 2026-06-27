const apiBaseUrl =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  '';

const storeToken = process.env.STORE_DEMO_BEARER_TOKEN || '';
const storeId = process.env.STORE_DEMO_STORE_ID || '';

export function isStoreApiConfigured() {
  return Boolean(apiBaseUrl && storeToken && storeId);
}

export function getStoreApiConfig() {
  return {
    apiBaseUrl,
    storeToken,
    storeId,
  };
}

export function getStoreApiHeaders(additionalHeaders?: HeadersInit) {
  return {
    Authorization: `Bearer ${storeToken}`,
    'x-store-id': storeId,
    ...(additionalHeaders ?? {}),
  };
}

export function buildStoreApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export async function fetchStoreApi<T>(path: string): Promise<T | null> {
  if (!isStoreApiConfigured()) {
    return null;
  }

  const response = await fetch(buildStoreApiUrl(path), {
    headers: getStoreApiHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

export async function requestStoreApi(path: string, init?: RequestInit) {
  if (!isStoreApiConfigured()) {
    return new Response(JSON.stringify({ ok: false, error: 'Store API is not configured' }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }

  return fetch(buildStoreApiUrl(path), {
    ...init,
    headers: getStoreApiHeaders(init?.headers),
    cache: 'no-store',
  });
}
