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

function getAuthToken(): string {
  if (typeof window === 'undefined') {
    return getTokenFromCookies();
  }
  // Client-side: get from URL param first, then localStorage
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

export function isAdminApiConfigured() {
  return Boolean(apiBaseUrl && getAuthToken());
}

export function getAdminApiHeaders(additionalHeaders?: HeadersInit) {
  return {
    Authorization: `Bearer ${getAuthToken()}`,
    ...(additionalHeaders ?? {}),
  };
}

export function buildAdminApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export async function fetchAdminApi<T>(path: string): Promise<T | null> {
  if (!isAdminApiConfigured()) {
    return null;
  }

  const response = await fetch(buildAdminApiUrl(path), {
    headers: getAdminApiHeaders(),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

export async function requestAdminApi(path: string, init?: RequestInit) {
  if (!isAdminApiConfigured()) {
    return new Response(JSON.stringify({ ok: false, error: 'Admin API is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  return fetch(buildAdminApiUrl(path), {
    ...init,
    headers: getAdminApiHeaders(init?.headers),
    cache: 'no-store',
  });
}
