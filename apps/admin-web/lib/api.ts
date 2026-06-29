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

async function getAuthToken(): Promise<string> {
  if (typeof window === 'undefined') {
    return getTokenFromCookies();
  }
  const client = getAuthTokenClient();
  if (client) return client;
  return getTokenFromCookies();
}

export async function isAdminApiConfigured(): Promise<boolean> {
  return Boolean(apiBaseUrl && await getAuthToken());
}

export async function getAdminApiHeaders(additionalHeaders?: HeadersInit) {
  return {
    Authorization: `Bearer ${await getAuthToken()}`,
    ...(additionalHeaders ?? {}),
  };
}

export function buildAdminApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export async function fetchAdminApi<T>(path: string): Promise<T | null> {
  if (!await isAdminApiConfigured()) {
    return null;
  }

  const response = await fetch(buildAdminApiUrl(path), {
    headers: await getAdminApiHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

export async function requestAdminApi(path: string, init?: RequestInit) {
  if (!await isAdminApiConfigured()) {
    return new Response(JSON.stringify({ ok: false, error: 'Admin API is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  return fetch(buildAdminApiUrl(path), {
    ...init,
    headers: await getAdminApiHeaders(init?.headers),
    cache: 'no-store',
  });
}
