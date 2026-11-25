import type { ReactNode } from 'react';

import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';
import { WorkspaceTabHost } from '../workspace-responsive';
import StoreHelpPage from '../help/page';
import { SupportWorkspace } from './support-workspace';

export default async function StoreSupportPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const access = await getStoreConsoleAccess();
  const params = (await searchParams) ?? {};

  const tabs: Array<{ key: string; label: string }> = [];
  const panels: Record<string, ReactNode> = {};

  if (access.canUseSupport) {
    tabs.push({ key: 'tickets', label: 'Tickets' });
    panels.tickets = <SupportWorkspace canUseSupport={access.canUseSupport} kind="support" />;
  }
  if (access.canUseDisputes) {
    tabs.push({ key: 'disputes', label: 'Disputes' });
    panels.disputes = <SupportWorkspace canUseSupport={access.canUseDisputes} kind="dispute" />;
  }
  tabs.push({ key: 'help', label: 'Help & Reference' });
  panels.help = <StoreHelpPage />;

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      <WorkspaceTabHost tabs={tabs} panels={panels} initialTab={params.tab} />
    </section>
  );
}
