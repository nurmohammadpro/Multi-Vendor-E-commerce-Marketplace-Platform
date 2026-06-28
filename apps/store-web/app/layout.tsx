import type { ReactNode } from 'react';

import './globals.css';
import { WorkspaceShell } from './workspace-shell';
import { getStoreConsoleAccess } from '../lib/access';

export const metadata = {
  title: 'Store Console',
  description: 'Phase 1 store operating system',
};

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/catalog', label: 'Catalog', permission: 'catalog.manage' },
  { href: '/inventory', label: 'Inventory', permission: 'inventory.view' },
  { href: '/pos', label: 'POS', permission: 'sales.pos.create' },
  { href: '/shipping', label: 'Shipping', permission: 'sales.report.view' },
  { href: '/reports', label: 'Reports', permission: 'sales.report.view' },
  { href: '/billing', label: 'Billing', permission: 'billing.subscription.manage' },
  { href: '/session', label: 'Session' },
  { href: '/staff', label: 'Staff', permission: 'store.staff.manage' },
  { href: '/settings', label: 'Settings', permission: 'store.settings.manage' },
  { href: '/hardware', label: 'Hardware', permission: 'store.settings.manage' },
];

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
      </body>
    </html>
  );
}
