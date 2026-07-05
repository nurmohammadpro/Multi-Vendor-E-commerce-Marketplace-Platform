import type { ReactNode } from 'react';

import './globals.css';
import { WorkspaceShell } from './workspace-shell';

export const metadata = {
  title: 'Admin Console',
  description: 'Phase 1 platform admin operating system',
};

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/stores', label: 'Store Ops' },
  { href: '/payments', label: 'Payments' },
  { href: '/reports', label: 'Reports' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/support', label: 'Support' },
  { href: '/audit', label: 'Audit' },
  { href: '/settings', label: 'Settings' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WorkspaceShell
          badge="Platform Admin"
          navItems={navItems}
          title="Admin Console"
        >
          {children}
        </WorkspaceShell>
      </body>
    </html>
  );
}
