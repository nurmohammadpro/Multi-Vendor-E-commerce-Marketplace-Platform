import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle, surfaceCardStyle } from '../merchflow-theme';
import { BankingWorkspace } from './banking-workspace';

export default async function StoreBankingPage() {
  const access = await getStoreConsoleAccess();
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      {access.canUseBankingReconciliation ? (
        <BankingWorkspace />
      ) : (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Banking Reconciliation locked</h3>
          <div style={emptyStateStyle}>Upgrade to Pro to use this workflow.</div>
        </article>
      )}
    </section>
  );
}
