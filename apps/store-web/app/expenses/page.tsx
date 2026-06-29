import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { getStoreConsoleAccess } from '../../lib/access';
import { ExpensesWorkspace } from './expenses-workspace';

export default async function StoreExpensesPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Daily Expense</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Daily expense control</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Record, review, and update day-level operating expenses for the store.
        </p>
      </section>
      {access.canUseDailyExpense ? (
        <ExpensesWorkspace />
      ) : (
        <Card>
          <CardHeader><CardTitle>Daily Expense locked</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Upgrade to Standard to use this workflow.</CardContent>
        </Card>
      )}
    </div>
  );
}
