import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';

import { Toaster } from '@/components/ui/sonner';
import './globals.css';
import { WorkspaceShell } from './workspace-shell';
import { getStoreConsoleAccess, type StoreConsoleFeature } from '../lib/access';

export const metadata: Metadata = {
  title: 'Store Console',
  description: 'Phase 1 store operating system',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/marketone-logo.svg',
    apple: '/marketone-logo.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'MarketOne',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

const navItems = [
  { href: '/', label: 'Dashboard', feature: 'dashboard' },
  { href: '/catalog', label: 'Catalog', permission: 'catalog.manage', feature: 'catalog' },
  { href: '/inventory', label: 'Stock', permission: 'inventory.view', feature: 'inventory' },
  { href: '/approvals', label: 'Approvals', permission: 'inventory.adjust.approve', feature: 'inventory' },
  { href: '/pos', label: 'Sales (POS)', permission: 'sales.pos.create', feature: 'pos' },
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
