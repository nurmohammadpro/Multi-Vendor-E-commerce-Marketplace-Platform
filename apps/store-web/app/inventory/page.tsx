import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../motocore-theme';

import { InventoryWorkspace } from './inventory-workspace';

export default async function StoreInventoryPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Inventory</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Inventory control</h2>
        <p style={tokenMutedStyle}>
          Use live inventory APIs for balances, adjustments, approvals, and ledger history.
        </p>
      </div>
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
