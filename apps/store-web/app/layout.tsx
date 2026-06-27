import type { ReactNode } from 'react';
import localFont from 'next/font/local';

import { WorkspaceShell } from './workspace-shell';
import './globals.css';

const geistSans = localFont({
  src: '../public/fonts/Geist-Regular.ttf',
  variable: '--font-geist-sans',
  display: 'swap',
  weight: '400',
});

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
      <body className={geistSans.variable}>
        <WorkspaceShell
          accent="motocore"
          badge="MotoCore"
          description="Owner, manager, and cashier workflows"
          navItems={navItems}
          title="Store Console"
        >
          {children}
        </WorkspaceShell>
      </body>
    </html>
  );
}
