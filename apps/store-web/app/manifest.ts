import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Merch Flow Store Console',
    short_name: 'Merch Flow',
    description: 'Installable store console for POS, stock, approvals, customers, and daily retail operations.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#0f172a',
    categories: ['business', 'productivity', 'shopping'],
    lang: 'en',
    dir: 'ltr',
    shortcuts: [
      {
        name: 'Open POS',
        short_name: 'POS',
        description: 'Jump straight into the sales terminal.',
        url: '/pos',
        icons: [{ src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Stock',
        short_name: 'Stock',
        description: 'Review balances, requests, and stock actions.',
        url: '/inventory',
        icons: [{ src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Approvals',
        short_name: 'Approvals',
        description: 'Review pending stock and price approvals.',
        url: '/approvals',
        icons: [{ src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
    icons: [
      {
        src: '/pwa/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/pwa/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/pwa/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
