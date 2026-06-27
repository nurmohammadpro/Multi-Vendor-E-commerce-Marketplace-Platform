import { pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../motocore-theme';

import { InventoryWorkspace } from './inventory-workspace';

export default function StoreInventoryPage() {
  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>Inventory</span>
        <h2 style={pageTitleStyle}>Inventory control</h2>
        <p style={pageLeadStyle}>Use live inventory APIs for balances, adjustments, approvals, and ledger history.</p>
      </section>
      <InventoryWorkspace />
    </main>
  );
}
