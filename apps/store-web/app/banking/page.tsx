import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../motocore-theme';
import { BankingWorkspace } from './banking-workspace';

export default async function StoreBankingPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Banking Reconciliation</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Bank accounts and reconciliation entries</h2>
        <p style={tokenMutedStyle}>
          Track bank accounts, add statement-side entries, and manage matched or flagged reconciliation items.
        </p>
      </div>
      {access.canUseBankingReconciliation ? (
        <BankingWorkspace />
      ) : (
        <Card>
          <CardHeader><CardTitle>Banking Reconciliation locked</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Upgrade to Pro to use this workflow.</CardContent>
        </Card>
      )}
    </section>
  );
}
