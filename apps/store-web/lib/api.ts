import { cookies } from 'next/headers';

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_DELAYS_MS = [350, 900];

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeAbortSignals(...signals: Array<AbortSignal | undefined>) {
  const available = signals.filter(Boolean) as AbortSignal[];
  if (available.length <= 1) {
    return available[0];
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of available) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

function isRetriableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function canRetryRequest(method: string, headers: Headers) {
  const normalizedMethod = method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod)) return true;
  return Boolean(headers.get('x-idempotency-key'));
}

async function fetchStoreApiWithRetry(
  path: string,
  init?: RequestInit,
) {
  const method = init?.method || 'GET';
  const headers = new Headers(await getStoreApiHeaders(init?.headers));
  const attempts = canRetryRequest(method, headers) ? DEFAULT_RETRY_DELAYS_MS.length + 1 : 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), DEFAULT_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(buildStoreApiUrl(path), {
        ...init,
        method,
        headers,
        cache: 'no-store',
        signal: mergeAbortSignals(init?.signal ?? undefined, timeoutController.signal),
      });

      if (!isRetriableStatus(response.status) || attempt === attempts - 1) {
        clearTimeout(timeoutId);
        return response;
      }
    } catch (error) {
      lastError = error as Error;
      if (attempt === attempts - 1) {
        clearTimeout(timeoutId);
        throw lastError;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    await sleep(DEFAULT_RETRY_DELAYS_MS[attempt] ?? DEFAULT_RETRY_DELAYS_MS.at(-1) ?? 500);
  }

  throw lastError ?? new Error(`Store API request failed for ${path}`);
}

export async function fetchStoreApi<T>(path: string): Promise<T | null> {
  if (!await isStoreApiConfigured()) {
    return null;
  }

  const response = await fetchStoreApiWithRetry(path, { headers: await getStoreApiHeaders() });

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

  return fetchStoreApiWithRetry(path, init);
}
