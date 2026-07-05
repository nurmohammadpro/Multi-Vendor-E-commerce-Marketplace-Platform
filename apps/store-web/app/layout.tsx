import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';

import { Toaster } from '@/components/ui/sonner';
import './globals.css';
import { WorkspaceShell } from './workspace-shell';
import { getStoreConsoleAccess, type StoreConsoleFeature } from '../lib/access';

export const metadata: Metadata = {
  title: 'Market One BD Store Console',
  applicationName: 'Market One BD',
  description: 'Installable multi-vendor store operating system for POS, inventory, billing, approvals, and retail workflows.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/pwa/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/pwa/icon-180.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/pwa/icon-192.png'],
  },
  appleWebApp: {
    capable: true,
    title: 'Market One BD',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
};

const navItems = [
  { href: '/', label: 'Dashboard', feature: 'dashboard' },
  { href: '/pos', label: 'Sales', permission: 'sales.pos.create', feature: 'pos' },
  { href: '/catalog', label: 'Products', permission: 'catalog.manage', feature: 'catalog' },
  { href: '/purchases', label: 'Purchases', feature: 'purchases' },
  { href: '/reports', label: 'Reports', permission: 'sales.report.view', feature: 'reports' },
] satisfies Array<{
  href: string;
  label: string;
  permission?: string;
  feature?: StoreConsoleFeature;
}>;

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const access = await getStoreConsoleAccess();

  return (
    <html lang="en">
      <body>
        <WorkspaceShell
          access={access}
          badge="Market One BD"
          navItems={navItems}
          title="Store Console"
        >
          {children}
        </WorkspaceShell>
        <Toaster />
      </body>
    </html>
  );
}
