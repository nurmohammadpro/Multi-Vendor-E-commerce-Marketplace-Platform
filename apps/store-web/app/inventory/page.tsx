import { getStoreConsoleAccess } from '../../lib/access';
import { pageIntroCardStyle, pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../marketone-theme';

import { InventoryWorkspace } from './inventory-workspace';

export default async function StoreInventoryPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ ...sectionIntroStyle, ...pageIntroCardStyle, maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Inventory</div>
        <h2 style={pageTitleStyle}>Inventory control</h2>
        <p style={pageLeadStyle}>
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
