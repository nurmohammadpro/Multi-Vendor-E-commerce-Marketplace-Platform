'use client';

import Link from 'next/link';

import {
  pageShellStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from '../merchflow-theme';

export default function OfflinePage() {
  return (
    <section style={{ ...pageShellStyle, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 10 }}>
      <article style={{ ...surfaceCardStyle, width: 'min(520px, 100%)', display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
          Offline Mode
        </div>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>Merch Flow is temporarily offline.</h1>
        <p style={tokenMutedStyle}>
          The app is installed and still available, but this screen needs a connection before it can load fresh store data.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => window.location.reload()} style={primaryButtonStyle}>
            Retry Connection
          </button>
          <Link href="/" style={{ ...secondaryButtonStyle, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            Open Dashboard
          </Link>
        </div>
      </article>
    </section>
  );
}
