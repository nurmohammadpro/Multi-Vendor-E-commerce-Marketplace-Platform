import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';

import { Toaster } from '@/components/ui/sonner';
import './globals.css';
import { WorkspaceShell } from './workspace-shell';
import { getStoreConsoleAccess, type StoreConsoleFeature } from '../lib/access';

export const metadata: Metadata = {
  title: 'Market One BD Store Console',
  applicationName: 'Market One BD',
          }}
        />
      </head>
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
