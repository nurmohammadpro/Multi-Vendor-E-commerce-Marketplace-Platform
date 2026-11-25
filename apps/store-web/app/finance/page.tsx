import type { ReactNode } from 'react';

import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle } from '../merchflow-theme';
import { WorkspaceTabHost } from '../workspace-responsive';
import { BankingWorkspace } from '../banking/banking-workspace';
import { ExpensesWorkspace } from '../expenses/expenses-workspace';

export default async function StoreFinancePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const access = await getStoreConsoleAccess();
  const params = (await searchParams) ?? {};

  const tabs: Array<{ key: string; label: string }> = [];
  const panels: Record<string, ReactNode> = {};

  if (access.canUseDailyExpense) {
    tabs.push({ key: 'expenses', label: 'Daily Expenses' });
    panels.expenses = <ExpensesWorkspace />;
  }
  if (access.canUseBankingReconciliation) {
    tabs.push({ key: 'banking', label: 'Banking' });
    panels.banking = <BankingWorkspace />;
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      {tabs.length ? (
        <WorkspaceTabHost tabs={tabs} panels={panels} initialTab={params.tab} />
      ) : (
        <div style={emptyStateStyle}>Your plan or role does not include expense and banking workflows.</div>
      )}
    </section>
  );
}
