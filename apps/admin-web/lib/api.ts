const apiBaseUrl =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  '';

const adminToken = process.env.ADMIN_DEMO_BEARER_TOKEN || '';

export function isAdminApiConfigured() {
  return Boolean(apiBaseUrl && adminToken);
}

export function getAdminApiHeaders(additionalHeaders?: HeadersInit) {
  return {
    Authorization: `Bearer ${adminToken}`,
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
