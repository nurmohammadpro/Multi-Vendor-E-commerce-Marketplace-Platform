import { Badge } from '@/components/ui/badge';
import { getStoreConsoleAccess } from '../../lib/access';

import { InventoryWorkspace } from './inventory-workspace';

export default async function StoreInventoryPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Inventory</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Inventory control</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Use live inventory APIs for balances, adjustments, approvals, and ledger history.
        </p>
      </section>
      <InventoryWorkspace
        canApproveInventory={access.canApproveInventory}
        canAdjustInventory={access.canAdjustInventory}
        canViewInventory={access.canViewInventory}
      />
    </div>
  );
}
