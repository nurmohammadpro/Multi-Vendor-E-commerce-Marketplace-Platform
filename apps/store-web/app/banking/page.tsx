import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { getStoreConsoleAccess } from '../../lib/access';
import { BankingWorkspace } from './banking-workspace';

export default async function StoreBankingPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Banking Reconciliation</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Bank accounts and reconciliation entries</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Track bank accounts, add statement-side entries, and manage matched or flagged reconciliation items.
        </p>
      </section>
      {access.canUseBankingReconciliation ? (
        <BankingWorkspace />
      ) : (
        <Card>
          <CardHeader><CardTitle>Banking Reconciliation locked</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Upgrade to Pro to use this workflow.</CardContent>
        </Card>
      )}
    </div>
  );
}
