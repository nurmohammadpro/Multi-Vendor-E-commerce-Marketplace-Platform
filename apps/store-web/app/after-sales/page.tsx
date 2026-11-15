import { Suspense, type ReactNode } from 'react';

import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle } from '../merchflow-theme';
import { WorkspaceTabHost } from '../workspace-responsive';
import { ExchangeWorkspace } from '../exchange/exchange-workspace';
import { ReturnsWorkspace } from '../returns/returns-workspace';
import { ShippingWorkspace } from '../shipping/shipping-workspace';
import { WarrantiesWorkspace } from '../warranties/warranties-workspace';

export default async function StoreAfterSalesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const access = await getStoreConsoleAccess();
  const params = (await searchParams) ?? {};

  const tabs: Array<{ key: string; label: string }> = [];
  const panels: Record<string, ReactNode> = {};

  if (access.canUsePos) {
    tabs.push({ key: 'shipments', label: 'Shipments' });
    panels.shipments = <ShippingWorkspace canManageShipping={access.canManageShipping} canViewShipping={access.canViewReports} />;
    tabs.push({ key: 'returns', label: 'Returns' });
    panels.returns = (
      <Suspense fallback={<div style={emptyStateStyle}>Loading returns…</div>}>
        <ReturnsWorkspace />
      </Suspense>
    );
    tabs.push({ key: 'exchange', label: 'Exchange' });
    panels.exchange = (
      <Suspense fallback={<div style={emptyStateStyle}>Loading exchange…</div>}>
        <ExchangeWorkspace />
      </Suspense>
    );
    tabs.push({ key: 'warranties', label: 'Warranties' });
    panels.warranties = (
      <Suspense fallback={<div style={emptyStateStyle}>Loading warranties…</div>}>
        <WarrantiesWorkspace />
      </Suspense>
    );
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      {tabs.length ? (
        <WorkspaceTabHost tabs={tabs} panels={panels} initialTab={params.tab} />
      ) : (
        <div style={emptyStateStyle}>Your role does not have access to after-sales.</div>
      )}
    </section>
  );
}
