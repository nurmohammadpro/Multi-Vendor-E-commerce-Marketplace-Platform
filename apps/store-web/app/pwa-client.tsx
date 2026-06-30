'use client';

import { useEffect, useState } from 'react';
import { Download, Share2, Smartphone } from 'lucide-react';

import { Button } from '@/components/ui/button';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function PwaClient() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showManualHint, setShowManualHint] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'safari-mac' | 'other'>('other');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/chrome|android|crios|fxios|edgios/.test(ua);
    setPlatform(isIos ? 'ios' : isSafari ? 'safari-mac' : 'other');

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowManualHint(true);
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
  };

  if (isStandalone) return null;

  const showInstallButton = Boolean(installPrompt) || platform !== 'other';

  return showInstallButton ? (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="h-8 rounded-md text-xs" onClick={() => void handleInstall()}>
        <Download className="mr-1.5 size-3.5" />
        Install App
      </Button>
      {showManualHint ? (
        <div className="hidden md:flex items-center gap-1.5 rounded-md border bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          {platform === 'ios' ? (
            <>
              <Share2 className="size-3.5" />
              Add to Home Screen from Safari Share menu
            </>
          ) : platform === 'safari-mac' ? (
            <>
              <Smartphone className="size-3.5" />
              In Safari, use File → Add to Dock
            </>
          ) : (
            'Use your browser install menu if the prompt does not appear.'
          )}
        </div>
      ) : null}
    </div>
  ) : null;
}
