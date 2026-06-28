'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/');
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
