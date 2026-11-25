'use client';

import { useEffect, useState } from 'react';
import { MonitorSmartphone, WifiOff } from 'lucide-react';

export function RuntimeStatus() {
  const [online, setOnline] = useState(true);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sync = () => {
      setOnline(window.navigator.onLine);
      setStandalone(
        window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
      );
    };

    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      {!online ? (
        <div className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          <WifiOff className="size-3.5" />
          Offline
        </div>
      ) : null}
      {standalone ? (
        <div className="hidden md:inline-flex items-center gap-1.5 rounded-md border bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          <MonitorSmartphone className="size-3.5" />
          Installed App
        </div>
      ) : null}
    </div>
  );
}
