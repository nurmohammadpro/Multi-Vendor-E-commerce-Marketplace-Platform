import type { ReactNode } from 'react';

import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle } from '../merchflow-theme';
import { WorkspaceTabHost } from '../workspace-responsive';
import { CustomersWorkspace } from '../customers/customers-workspace';
import { ReceivablesWorkspace } from './receivables-workspace';

export default async function StoreReceivablesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const access = await getStoreConsoleAccess();
  const params = (await searchParams) ?? {};

  const tabs: Array<{ key: string; label: string }> = [];
  const panels: Record<string, ReactNode> = {};

  if (access.canUseReceivables) {
    tabs.push({ key: 'dues', label: 'Receivables' });
    panels.dues = <ReceivablesWorkspace />;
  }
  if (access.canViewReports) {
    tabs.push({ key: 'customers', label: 'Customers' });
    panels.customers = <CustomersWorkspace />;
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      {tabs.length ? (
        <WorkspaceTabHost tabs={tabs} panels={panels} initialTab={params.tab} />
      ) : (
        <div style={emptyStateStyle}>Your current role cannot open receivables.</div>
      )}
    </section>
  );
}
