import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { getStoreConsoleAccess } from '../../lib/access';
import { PayrollWorkspace } from './payroll-workspace';

export default async function StorePayrollPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">HR & Payroll</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Employees and payroll runs</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Maintain employee records and run payroll periods with stored net totals.
        </p>
      </section>
      {access.canUsePayroll ? (
        <PayrollWorkspace />
      ) : (
        <Card>
          <CardHeader><CardTitle>HR & Payroll locked</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Upgrade to Pro to use this workflow.</CardContent>
        </Card>
      )}
    </div>
  );
}
