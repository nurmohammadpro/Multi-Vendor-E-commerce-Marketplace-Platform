const apiBaseUrl =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  '';

export function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export async function requestApi(path: string, init?: RequestInit) {
  if (!apiBaseUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'API is not configured' }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }

  return fetch(buildApiUrl(path), {
    ...init,
    cache: 'no-store',
  });
}
