import { cookies } from 'next/headers';

function normalizeApiBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

const apiBaseUrl = normalizeApiBaseUrl(
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  '',
);

async function getTokenFromCookies(): Promise<string> {
  try {
    const store = await cookies();
    return store.get('auth_token')?.value || '';
  } catch {
    return '';
  }
}

async function getStoreIdFromCookies(): Promise<string> {
  try {
    const store = await cookies();
    return store.get('store_id')?.value || '';
  } catch {
    return '';
  }
}

function getAuthTokenClient(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) {
    localStorage.setItem('auth_token', urlToken);
    document.cookie = `auth_token=${urlToken}; path=/; max-age=86400; SameSite=Lax`;
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.toString());
    return urlToken;
  }
  return localStorage.getItem('auth_token') || '';
}

function getStoreIdClient(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const urlStoreId = params.get('storeId');
  if (urlStoreId) {
    localStorage.setItem('store_id', urlStoreId);
    document.cookie = `store_id=${urlStoreId}; path=/; max-age=86400; SameSite=Lax`;
    const url = new URL(window.location.href);
    url.searchParams.delete('storeId');
    window.history.replaceState({}, '', url.toString());
    return urlStoreId;
  }
  return localStorage.getItem('store_id') || '';
}

async function getAuthToken(): Promise<string> {
  if (typeof window === 'undefined') {
    return getTokenFromCookies();
  }
  const client = getAuthTokenClient();
  if (client) return client;
  return getTokenFromCookies();
}

async function getStoreId(): Promise<string> {
  if (typeof window === 'undefined') {
    return getStoreIdFromCookies();
  }
  const client = getStoreIdClient();
  if (client) return client;
  return getStoreIdFromCookies();
}

export async function isStoreApiConfigured(): Promise<boolean> {
  return Boolean(apiBaseUrl && await getAuthToken() && await getStoreId());
}

export async function getStoreApiConfig() {
  return {
    apiBaseUrl,
    storeToken: await getAuthToken(),
    storeId: await getStoreId(),
  };
}

export async function getStoreApiHeaders(additionalHeaders?: HeadersInit) {
  return {
    Authorization: `Bearer ${await getAuthToken()}`,
    'x-store-id': await getStoreId(),
    ...(additionalHeaders ?? {}),
  };
}

export function buildStoreApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export async function fetchStoreApi<T>(path: string): Promise<T | null> {
  if (!await isStoreApiConfigured()) {
    return null;
  }

  const response = await fetch(buildStoreApiUrl(path), {
    headers: await getStoreApiHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

export async function requestStoreApi(path: string, init?: RequestInit) {
  if (!await isStoreApiConfigured()) {
    return new Response(JSON.stringify({ ok: false, error: 'Store API is not configured' }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }

  return fetch(buildStoreApiUrl(path), {
    ...init,
    headers: await getStoreApiHeaders(init?.headers),
    cache: 'no-store',
  });
}
