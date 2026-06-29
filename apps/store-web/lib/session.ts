export function clearStoreSessionClient() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('auth_token');
  localStorage.removeItem('store_id');
  document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'store_id=; path=/; max-age=0; SameSite=Lax';
}
