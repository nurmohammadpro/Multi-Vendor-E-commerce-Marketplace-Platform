'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { clearAdminSessionClient } from '../../lib/session';

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const loginUrl = process.env.NEXT_PUBLIC_LOGIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '/';

  const handleLogout = () => {
    setLoading(true);
    clearAdminSessionClient();
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.replace(loginUrl);
  };

  return (
    <Button variant="outline" onClick={() => void handleLogout()} disabled={loading}>
      {loading ? 'Logging out' : 'Log out'}
    </Button>
  );
}
