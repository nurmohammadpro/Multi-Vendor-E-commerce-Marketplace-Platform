import type { ReactNode } from 'react';

import './globals.css';

export const metadata = {
  title: 'Market One BD',
  description: 'Multi-Vendor Platform — Login',
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
