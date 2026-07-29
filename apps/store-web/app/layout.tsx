import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@mvp/theme';

import { Toaster } from '@/components/ui/sonner';
import './globals.css';
import { WorkspaceShell } from './workspace-shell';
import { getStoreConsoleAccess, type StoreConsoleFeature } from '../lib/access';

export const metadata: Metadata = {
  title: 'Merch Flow Store Console',
  applicationName: 'Merch Flow',
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
    label: 'Sales',
    items: [
      { href: '/pos', label: 'Point of Sale', permission: 'sales.pos.create', feature: 'pos' },
      { href: '/sales-history', label: 'Sales History', permission: 'sales.report.view', feature: 'reports' },
      { href: '/returns', label: 'Returns & Refunds', permission: 'sales.returns.manage', feature: 'returns' },
      { href: '/receivables', label: 'Receivables', permission: 'sales.report.view', feature: 'receivables' },
      { href: '/customers', label: 'Customers', permission: 'sales.report.view', feature: 'customers' },
      { href: '/shipping', label: 'Shipping', permission: 'sales.pos.create', feature: 'shipping' },
    ],
  },
  {
    label: 'Product & Stock',
    items: [
      { href: '/inventory', label: 'Stock', permission: 'inventory.view', feature: 'inventory' },
      { href: '/taxonomy', label: 'Categories & Brands', feature: 'inventory' },
      { href: '/locations', label: 'Locations', permission: 'inventory.view', feature: 'inventory' },
      { href: '/purchases', label: 'Purchases', feature: 'purchases' },
      { href: '/suppliers', label: 'Suppliers', feature: 'purchases' },
      { href: '/approvals', label: 'Approvals', permission: 'inventory.adjust.approve', feature: 'inventory' },
    ],
  },
  {
    label: 'Reports & Activity',
    items: [
      { href: '/reports', label: 'Reports', permission: 'sales.report.view', feature: 'reports' },
      { href: '/activity', label: 'Activity Log', permission: 'sales.report.view', feature: 'reports' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/expenses', label: 'Expenses', feature: 'expenses' },
      { href: '/banking', label: 'Banking', feature: 'banking' },
      { href: '/billing', label: 'Subscription', permission: 'billing.subscription.manage', feature: 'billing' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/staff', label: 'Team', permission: 'store.staff.manage', feature: 'staff' },
      { href: '/settings', label: 'Settings', permission: 'store.settings.manage', feature: 'settings' },
      { href: '/hardware', label: 'Hardware', permission: 'store.settings.manage', feature: 'hardware' },
    ],
  },
  {
    label: 'Support',
    items: [
      { href: '/disputes', label: 'Disputes', permission: 'sales.report.view', feature: 'disputes' },
      { href: '/support', label: 'Support', permission: 'sales.report.view', feature: 'support' },
      { href: '/help', label: 'Help & Reference' },
    ],
  },
] satisfies Array<{
  label: string;
  items: Array<{
    href: string;
    label: string;
    permission?: string;
    feature?: StoreConsoleFeature;
  }>;
}>;

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const access = await getStoreConsoleAccess();

  return (
    <html lang="en">
      <body>
        <ThemeProvider>
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
