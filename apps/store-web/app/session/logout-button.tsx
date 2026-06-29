'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { logoutStoreClient } from '../../lib/logout';

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    await logoutStoreClient();
  };

  return (
    <Button variant="outline" onClick={() => void handleLogout()} disabled={loading}>
      {loading ? 'Logging out' : 'Log out'}
    </Button>
  );
}
