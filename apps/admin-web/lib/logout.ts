'use client';

import { clearAdminSessionClient } from './session';

const LOGIN_APP_URL = process.env.NEXT_PUBLIC_LOGIN_APP_URL || 'http://localhost:3000';

function getLoginHomeUrl() {
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return new URL('/', LOGIN_APP_URL).toString();
    }

    const hostnameParts = hostname.split('.');
    if (hostnameParts.length > 2 && ['admin', 'app', 'store'].includes(hostnameParts[0] || '')) {
      return `${protocol}//${hostnameParts.slice(1).join('.')}/`;
    }
  }

  return new URL('/', LOGIN_APP_URL).toString();
}

export async function logoutAdminClient() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    // Continue clearing client state even if the upstream logout request fails.
  } finally {
    clearAdminSessionClient();
    window.location.assign(getLoginHomeUrl());
  }
}
