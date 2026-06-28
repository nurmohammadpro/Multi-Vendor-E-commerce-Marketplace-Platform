import { Badge } from '@/components/ui/badge';
import { getStoreConsoleAccess } from '../../lib/access';

import { ReportsWorkspace } from './reports-workspace';

export default async function StoreReportsPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Reports</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Store reports</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Daily sales, inventory snapshots, and export jobs are available from the live reporting APIs.
        </p>
      </section>
      <ReportsWorkspace canViewReports={access.canViewReports} />
    </div>
  );
}
