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

function resolveCookieDomain(hostname?: string) {
  const explicit = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
  if (explicit) {
    return explicit.startsWith('.') ? explicit : `.${explicit}`;
  }
  const host = hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  if (!host || host === 'localhost' || host === '127.0.0.1') return '';
  if (host.endsWith('merchflow.appbrainer.tech')) return '.merchflow.appbrainer.tech';
  return '';
}

function setClientCookie(name: string, value: string, maxAge: number) {
  const domain = resolveCookieDomain();
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
}

function getClientCookie(name: string) {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : '';
}

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
    setClientCookie('auth_token', urlToken, 86400);
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.toString());
    return urlToken;
  }
  const cookieToken = getClientCookie('auth_token');
  if (cookieToken) {
    localStorage.setItem('auth_token', cookieToken);
    return cookieToken;
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
