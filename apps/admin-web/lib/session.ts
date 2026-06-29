'use client';

export function clearAdminSessionClient() {
  localStorage.removeItem('auth_token');
  document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'store_id=; path=/; max-age=0; SameSite=Lax';
}
