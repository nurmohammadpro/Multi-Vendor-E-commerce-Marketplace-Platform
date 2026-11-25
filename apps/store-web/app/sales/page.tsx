import type { ReactNode } from 'react';

import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle } from '../merchflow-theme';
import { WorkspaceTabHost } from '../workspace-responsive';
import { InvoicesWorkspace } from '../invoices/invoices-workspace';
import { SalesHistoryWorkspace } from '../sales-history/sales-history-workspace';

export default async function StoreSalesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const access = await getStoreConsoleAccess();
  const params = (await searchParams) ?? {};

  const tabs: Array<{ key: string; label: string }> = [];
  const panels: Record<string, ReactNode> = {};

  if (access.canViewReports) {
    tabs.push({ key: 'history', label: 'Sales History' });
    panels.history = <SalesHistoryWorkspace />;
  }
  if (access.canUseInvoices) {
    tabs.push({ key: 'invoices', label: 'Invoices' });
    panels.invoices = <InvoicesWorkspace />;
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      {tabs.length ? (
        <WorkspaceTabHost tabs={tabs} panels={panels} initialTab={params.tab} />
      ) : (
        <div style={emptyStateStyle}>Your role does not have access to sales records.</div>
      )}
    </section>
  );
}
