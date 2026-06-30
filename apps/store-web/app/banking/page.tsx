import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageIntroCardStyle, pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle, surfaceCardStyle } from '../motocore-theme';
import { BankingWorkspace } from './banking-workspace';

export default async function StoreBankingPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ ...sectionIntroStyle, ...pageIntroCardStyle, maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Banking Reconciliation</div>
        <h2 style={pageTitleStyle}>Bank accounts and reconciliation entries</h2>
        <p style={pageLeadStyle}>
          Track bank accounts, add statement-side entries, and manage matched or flagged reconciliation items.
        </p>
      </div>
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
