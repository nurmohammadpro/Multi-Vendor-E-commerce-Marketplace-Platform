'use client';

import { useEffect, useState } from 'react';

export function IntroSplash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setVisible(false);
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="intro-splash" aria-hidden="true">
      <div className="intro-splash__glow" />
      <div className="intro-splash__card">
        <img
          src="/marketone-logo.svg"
          alt="Market One logo"
          className="intro-splash__logo"
        />
        <div className="intro-splash__text">
          <span className="intro-splash__eyebrow">Market One</span>
          <span className="intro-splash__title">Multi-vendor operations, ready to go</span>
        </div>
      </div>
    </div>
  );
}
