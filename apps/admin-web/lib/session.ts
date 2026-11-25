'use client';

export function clearAdminSessionClient() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('store_id');
  const pastDate = 'Thu, 01 Jan 1970 00:00:00 GMT';
  document.cookie = `auth_token=; path=/; expires=${pastDate}; max-age=0; SameSite=Lax`;
  document.cookie = `store_id=; path=/; expires=${pastDate}; max-age=0; SameSite=Lax`;
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('merchflow.appbrainer.tech')) {
    document.cookie = `auth_token=; path=/; expires=${pastDate}; max-age=0; SameSite=Lax; Domain=.merchflow.appbrainer.tech`;
    document.cookie = `store_id=; path=/; expires=${pastDate}; max-age=0; SameSite=Lax; Domain=.merchflow.appbrainer.tech`;
  }
}
