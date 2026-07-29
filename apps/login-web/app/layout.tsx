import type { ReactNode } from 'react';
import { ThemeProvider } from '@mvp/theme';

import './globals.css';

export const metadata = {
  title: 'Merch Flow',
  description: 'Multi-Vendor Platform — Login',
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
