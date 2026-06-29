'use client';

import { clearStoreSessionClient } from './session';

const LOGIN_APP_URL = process.env.NEXT_PUBLIC_LOGIN_APP_URL || 'http://localhost:3000';

function getLoginHomeUrl() {
  return new URL('/', LOGIN_APP_URL).toString();
}

export async function logoutStoreClient() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    // Continue clearing client state even if the upstream logout request fails.
  } finally {
    clearStoreSessionClient();
    window.location.assign(getLoginHomeUrl());
  }
}
