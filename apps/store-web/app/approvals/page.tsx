import { Badge } from '@/components/ui/badge';
import { getStoreConsoleAccess } from '../../lib/access';

import { ApprovalsWorkspace } from './approvals-workspace';

export default async function StoreApprovalsPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Approvals</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Owner approval queue</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Review pending stock quantity changes and manager-requested price updates in one place.
        </p>
      </section>
      <ApprovalsWorkspace canApproveInventory={access.canApproveInventory} />
    </div>
  );
}
