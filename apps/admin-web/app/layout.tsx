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
  { href: '/audit', label: 'Audit' },
  { href: '/session', label: 'Session' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/support', label: 'Support' },
  { href: '/settings', label: 'Settings' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
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
