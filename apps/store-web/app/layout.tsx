import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@mvp/theme';

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
  { href: '/inventory', label: 'Stock', permission: 'inventory.view', feature: 'inventory' },
  { href: '/locations', label: 'Locations', permission: 'inventory.view', feature: 'inventory' },
  { href: '/purchases', label: 'Purchases', feature: 'purchases' },
  { href: '/customers', label: 'Customers', permission: 'sales.report.view', feature: 'customers' },
  { href: '/reports', label: 'Reports', permission: 'sales.report.view', feature: 'reports' },
  { href: '/staff', label: 'Staff', permission: 'store.staff.manage', feature: 'staff' },
  { href: '/expenses', label: 'Expenses', feature: 'expenses' },
  { href: '/payroll', label: 'Payroll', feature: 'payroll' },
  { href: '/banking', label: 'Banking', feature: 'banking' },
  { href: '/billing', label: 'Subscription', permission: 'billing.subscription.manage', feature: 'billing' },
  { href: '/support', label: 'Support', permission: 'sales.report.view', feature: 'support' },
  { href: '/settings', label: 'Settings', permission: 'store.settings.manage', feature: 'settings' },
  { href: '/hardware', label: 'Hardware', permission: 'store.settings.manage', feature: 'hardware' },
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
        <ThemeProvider>
        <WorkspaceShell
          access={access}
          badge="Market One BD"
          navItems={navItems}
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
