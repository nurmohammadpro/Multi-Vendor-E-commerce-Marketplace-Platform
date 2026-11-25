import type { ReactNode } from 'react';
import { ThemeProvider } from '@mvp/theme';

import './globals.css';

export const metadata = {
  title: 'Merchant Flow',
  description: 'Multi-Vendor Platform — Login',
  icons: {
    icon: [{ url: '/favicon.png', sizes: '32x32', type: 'image/png' }],
    shortcut: ['/favicon.png'],
  },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
