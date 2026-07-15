import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, pageTitleStyle, sectionLabelStyle, tokenMutedStyle } from '../marketone-theme';
import { PayrollWorkspace } from './payroll-workspace';

export default async function StorePayrollPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>HR & Payroll</div>
        <h2 style={{ ...pageTitleStyle, margin: '8px 0' }}>Employees and payroll runs</h2>
        <p style={tokenMutedStyle}>
          Maintain employee records and run payroll periods with stored net totals.
        </p>
      </div>
      {access.canUsePayroll ? (
        <PayrollWorkspace />
      ) : (
        <Card>
          <CardHeader><CardTitle>HR & Payroll locked</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Upgrade to Pro to use this workflow.</CardContent>
        </Card>
      )}
    </section>
  );
}
