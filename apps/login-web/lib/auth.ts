export type AuthContext =
  | { type: 'admin'; roles: string[] }
  | { type: 'store'; storeId: string; roles: string[] }
  | { type: 'customer'; customerId: string };

export type LoginResponse = {
  tokenType: string;
  accessToken: string;
  expiresAt: string;
  user: {
    id: string;
    tenantId: string;
    email: string | null;
    phone: string | null;
    preferredLocale: string;
  };
  contexts: AuthContext[];
};

export type ContextSelectResponse = {
  activeContext: AuthContext;
};

const TOKEN_KEY = 'mvp_access_token';
const STORE_ID_KEY = 'mvp_store_id';
const ADMIN_APP_URL = process.env.NEXT_PUBLIC_ADMIN_APP_URL || 'http://localhost:3001';
const STORE_APP_URL = process.env.NEXT_PUBLIC_STORE_APP_URL || 'http://localhost:3002';

function resolveCookieDomain(hostname?: string) {
  const explicit = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
  if (explicit) {
    return explicit.startsWith('.') ? explicit : `.${explicit}`;
  }
  const host = hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  if (!host || host === 'localhost' || host === '127.0.0.1') return '';
  if (host.endsWith('marketone.appbrainer.tech')) return '.marketone.appbrainer.tech';
  return '';
}

function buildCookie(name: string, value: string, maxAge: number) {
  const domain = resolveCookieDomain();
  return `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
}

function clearCookie(name: string) {
  const domain = resolveCookieDomain();
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  if (domain) {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax; Domain=${domain}`;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void { if (typeof document !== "undefined") document.cookie = buildCookie('auth_token', token, 86400);
  localStorage.setItem(TOKEN_KEY, token);
}

export function storeStoreId(storeId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (!storeId) {
    localStorage.removeItem(STORE_ID_KEY);
    clearCookie('store_id');
    return;
  }
  localStorage.setItem(STORE_ID_KEY, storeId);
  document.cookie = buildCookie('store_id', storeId, 86400);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(STORE_ID_KEY);
  clearCookie('auth_token');
  clearCookie('store_id');
}

export function getWorkspaceUrl(contextType: AuthContext['type']) {
  return contextType === 'admin' ? ADMIN_APP_URL : STORE_APP_URL;
}

export function hasOnlyAdminContext(contexts: AuthContext[]) {
  return contexts.length === 1 && contexts[0]?.type === 'admin';
}

export function hasOnlyStoreContext(contexts: AuthContext[]) {
  return contexts.length === 1 && contexts[0]?.type === 'store';
}

export async function login(
  identifier: string,
  password: string,
): Promise<LoginResponse> {
  const isEmail = identifier.includes('@');
  const body = isEmail
    ? { email: identifier, password }
    : { phone: identifier, password };

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Login failed' }));
    throw new Error(error.message || 'Login failed');
  }

  return res.json();
}

export async function selectContext(
  token: string,
  contextType: 'admin' | 'store' | 'customer',
  storeId?: string,
): Promise<ContextSelectResponse> {
  const body: Record<string, string> = { type: contextType };
  if (storeId) body.storeId = storeId;

  const res = await fetch('/api/auth/select-context', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error('Failed to select context');
  }

  return res.json();
}
