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
  { href: '/catalog', label: 'Catalog', permission: 'catalog.manage', feature: 'catalog' },
  { href: '/inventory', label: 'Stock', permission: 'inventory.view', feature: 'inventory' },
  { href: '/purchases', label: 'Purchases', feature: 'purchases' },
  { href: '/approvals', label: 'Approvals', permission: 'inventory.adjust.approve', feature: 'inventory' },
  { href: '/pos', label: 'Sales (POS)', permission: 'sales.pos.create', feature: 'pos' },
  { href: '/receivables', label: 'Receivables', permission: 'sales.report.view', feature: 'receivables' },
  { href: '/customers', label: 'Customers', permission: 'sales.report.view', feature: 'customers' },
  { href: '/reports', label: 'Reports', permission: 'sales.report.view', feature: 'reports' },
  { href: '/activity', label: 'Activity', permission: 'sales.report.view', feature: 'reports' },
  { href: '/disputes', label: 'Disputes', permission: 'sales.report.view', feature: 'disputes' },
  { href: '/support', label: 'Support', permission: 'sales.report.view', feature: 'support' },
  { href: '/staff', label: 'User Management', permission: 'store.staff.manage', feature: 'staff' },
  { href: '/expenses', label: 'Daily Expense', feature: 'expenses' },
  { href: '/payroll', label: 'HR & Payroll', feature: 'payroll' },
  { href: '/banking', label: 'Banking', feature: 'banking' },
  { href: '/billing', label: 'Subscription', permission: 'billing.subscription.manage', feature: 'billing' },
  { href: '/session', label: 'Session', feature: 'session' },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
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
