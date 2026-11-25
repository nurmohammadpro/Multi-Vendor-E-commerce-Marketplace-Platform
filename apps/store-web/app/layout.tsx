import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@mvp/theme';

import { Toaster } from '@/components/ui/sonner';
import './globals.css';
import { WorkspaceShell } from './workspace-shell';
import { GlobalEnterNavigation } from './lib/global-enter-navigation';
import { getStoreConsoleAccess, type StoreConsoleFeature } from '../lib/access';

export const metadata: Metadata = {
  title: 'Merch Flow Store Console',
  applicationName: 'Merch Flow',
  description: 'Installable multi-vendor store operating system for POS, inventory, billing, approvals, and retail workflows.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.png', sizes: 'any', type: 'image/png' },
      { url: '/pwa/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/pwa/icon-180.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/favicon.png'],
  },
  appleWebApp: {
    capable: true,
    title: 'Merch Flow',
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

const navGroups = [
  {
    label: 'Dashboard',
    items: [
      { href: '/', label: 'Dashboard', feature: 'dashboard' },
    ],
  },
  {
    label: 'Sell',
    items: [
      { href: '/pos', label: 'Point of Sale', permission: 'sales.pos.create', feature: 'pos' },
      { href: '/sales', label: 'Records', permission: 'sales.report.view', feature: 'reports' },
      { href: '/after-sales', label: 'After-Sales', permission: 'sales.pos.create', feature: 'pos' },
      { href: '/receivables', label: 'Customers & Dues', permission: 'sales.report.view', feature: 'receivables' },
    ],
  },
  {
    label: 'Stock',
    items: [
      { href: '/inventory', label: 'Inventory', permission: 'inventory.view', feature: 'inventory' },
      { href: '/catalog', label: 'Catalog', permission: 'inventory.view', feature: 'inventory' },
      { href: '/purchases', label: 'Purchases', feature: 'purchases' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/finance', label: 'Finance', feature: 'expenses' },
      { href: '/billing', label: 'Subscription', permission: 'billing.subscription.manage', feature: 'billing' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/reports', label: 'Reports', permission: 'sales.report.view', feature: 'reports' },
      { href: '/support', label: 'Support', permission: 'sales.report.view', feature: 'support' },
      { href: '/staff', label: 'Team', permission: 'store.staff.manage', feature: 'staff' },
      { href: '/settings', label: 'Settings', permission: 'store.settings.manage', feature: 'settings' },
    ],
  },
] satisfies Array<{
  label: string;
  items: Array<{
    href: string;
    label: string;
    permission?: string;
    feature?: StoreConsoleFeature;
    hideForWholesale?: boolean;
  }>;
}>;

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const access = await getStoreConsoleAccess();

  return (
    <html lang="en">
      <body>
        <ThemeProvider>
        <GlobalEnterNavigation />
        <WorkspaceShell
          access={access}
          badge="Merch Flow"
          navItems={navGroups}
          title="Store Console"
        >
          {children}
        </WorkspaceShell>
        <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
