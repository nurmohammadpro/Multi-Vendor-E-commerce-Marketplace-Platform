import type { ReactNode } from 'react';

import './globals.css';
import { WorkspaceShell } from './workspace-shell';

export const metadata = {
  title: 'Store Console',
  description: 'Phase 1 store operating system',
};

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/pos', label: 'POS' },
  { href: '/shipping', label: 'Shipping' },
  { href: '/reports', label: 'Reports' },
  { href: '/billing', label: 'Billing' },
  { href: '/session', label: 'Session' },
  { href: '/staff', label: 'Staff' },
  { href: '/settings', label: 'Settings' },
];

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WorkspaceShell
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
