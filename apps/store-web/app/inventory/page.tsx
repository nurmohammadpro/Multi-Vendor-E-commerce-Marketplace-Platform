import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../marketone-theme';

import { InventoryWorkspace } from './inventory-workspace';

export default async function StoreInventoryPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <InventoryWorkspace
        canApproveInventory={access.canApproveInventory}
        canAdjustInventory={access.canAdjustInventory}
        canDirectAdjustInventory={access.canDirectAdjustInventory}
        canRequestAdjustInventory={access.canRequestAdjustInventory}
        canViewInventory={access.canViewInventory}
      />
    </section>
  );
}
