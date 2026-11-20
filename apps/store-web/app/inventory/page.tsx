import type { ReactNode } from 'react';

import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle } from '../merchflow-theme';
import { WorkspaceTabHost } from '../workspace-responsive';
import { ApprovalsWorkspace } from '../approvals/approvals-workspace';
import BarcodesPage from '../barcodes/page';
import { InventoryWorkspace } from './inventory-workspace';
import { LocationsWorkspace } from '../locations/locations-workspace';
import { TransfersPanel } from './transfers-panel';
import { StockLedgerWorkspace } from '../stock-ledger/stock-ledger-workspace';

export default async function StoreInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const access = await getStoreConsoleAccess();
  const params = (await searchParams) ?? {};
  const isWholesale = access.planCode === 'wholesale';

  const tabs: Array<{ key: string; label: string }> = [];
  const panels: Record<string, ReactNode> = {};

  if (access.canViewInventory) {
    tabs.push({ key: 'balances', label: 'Stock' });
    panels.balances = (
      <InventoryWorkspace
        canApproveInventory={access.canApproveInventory}
        canAdjustInventory={access.canAdjustInventory}
        canDirectAdjustInventory={access.canDirectAdjustInventory}
        canRequestAdjustInventory={access.canRequestAdjustInventory}
        canViewInventory={access.canViewInventory}
      />
    );
    tabs.push({ key: 'ledger', label: 'Stock Ledger' });
    panels.ledger = <StockLedgerWorkspace />;
    tabs.push({ key: 'barcodes', label: 'Barcode Labels' });
    panels.barcodes = <BarcodesPage />;
    if (!isWholesale) {
      tabs.push({ key: 'locations', label: 'Locations' });
      tabs.push({ key: 'transfers', label: 'Transfers' });
      panels.transfers = (
        <TransfersPanel canTransfer={access.canManageLocations || access.canAdjustInventory} />
      );
    }
  }
  if (access.canApproveInventory && !isWholesale) {
    tabs.push({ key: 'approvals', label: 'Approvals' });
    panels.approvals = <ApprovalsWorkspace canApproveInventory={access.canApproveInventory} />;
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      {tabs.length ? (
        <WorkspaceTabHost tabs={tabs} panels={panels} initialTab={params.tab} />
      ) : (
        <div style={emptyStateStyle}>Your role does not have access to inventory.</div>
      )}
    </section>
  );
}
