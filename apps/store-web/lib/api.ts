import { cookies } from 'next/headers';

const apiBaseUrl =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  '';

function getTokenFromCookies(): string {
  try {
    const store = cookies();
    return store.get('auth_token')?.value || '';
  } catch {
    return '';
  }
}

function getStoreIdFromCookies(): string {
  try {
    const store = cookies();
    return store.get('store_id')?.value || '';
  } catch {
    return '';
  }
}

function getAuthToken(): string {
  if (typeof window === 'undefined') {
    return getTokenFromCookies();
  }
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
  return localStorage.getItem('auth_token') || getTokenFromCookies();
}

function getStoreId(): string {
  if (typeof window === 'undefined') {
    return getStoreIdFromCookies();
  }
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
  return localStorage.getItem('store_id') || getStoreIdFromCookies();
}

export function isStoreApiConfigured() {
  return Boolean(apiBaseUrl && getAuthToken() && getStoreId());
}

export function getStoreApiConfig() {
  return {
    apiBaseUrl,
    storeToken: getAuthToken(),
    storeId: getStoreId(),
  };
}

export function getStoreApiHeaders(additionalHeaders?: HeadersInit) {
  return {
    Authorization: `Bearer ${getAuthToken()}`,
    'x-store-id': getStoreId(),
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
