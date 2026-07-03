import type { ReactNode } from 'react';

import './globals.css';
import { WorkspaceShell } from './workspace-shell';

export const metadata = {
  title: 'Admin Console',
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
