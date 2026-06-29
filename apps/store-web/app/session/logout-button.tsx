'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { clearStoreSessionClient } from '../../lib/session';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearStoreSessionClient();
      router.replace(process.env.NEXT_PUBLIC_LOGIN_APP_URL || '/');
      router.refresh();
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={() => void handleLogout()} disabled={loading}>
      {loading ? 'Logging out' : 'Log out'}
    </Button>
  );
}
