'use client';

import { useEffect, useState } from 'react';

export function IntroSplash({ onComplete }: { onComplete?: () => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [onComplete]);

  if (!visible) {
    return null;
  }

  return (
    <div className="intro-splash" aria-hidden="true">
      <div className="intro-splash__glow" />
      <div className="intro-splash__card">
        <img
          src="/merchflow-logo.svg"
          alt="Merch Flow logo"
          className="intro-splash__logo"
        />
        <div className="intro-splash__text">
          <span className="intro-splash__eyebrow">Merch Flow</span>
          <span className="intro-splash__title">A Complete Business Solution</span>
        </div>
      </div>
    </div>
  );
}
