import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../motocore-theme';
import { ExpensesWorkspace } from './expenses-workspace';

export default async function StoreExpensesPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Daily Expense</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Daily expense control</h2>
        <p style={tokenMutedStyle}>
          Record, review, and update day-level operating expenses for the store.
        </p>
      </div>
      {access.canUseDailyExpense ? (
        <ExpensesWorkspace />
      ) : (
        <Card>
          <CardHeader><CardTitle>Daily Expense locked</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Upgrade to Standard to use this workflow.</CardContent>
        </Card>
      )}
    </section>
  );
}
