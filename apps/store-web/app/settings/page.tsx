import type { ReactNode } from 'react';

import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle } from '../merchflow-theme';
import { WorkspaceTabHost } from '../workspace-responsive';
import { HardwareWorkspace } from '../hardware/hardware-workspace';
import { SettingsWorkspace } from './settings-workspace';

export default async function StoreSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const access = await getStoreConsoleAccess();
  const params = (await searchParams) ?? {};

  const tabs: Array<{ key: string; label: string }> = [];
  const panels: Record<string, ReactNode> = {};

  if (access.canManageSettings) {
    tabs.push({ key: 'settings', label: 'Store Settings' });
    panels.settings = <SettingsWorkspace canManageSettings={access.canManageSettings} />;
    tabs.push({ key: 'hardware', label: 'Hardware' });
    panels.hardware = <HardwareWorkspace canManageSettings={access.canManageSettings} />;
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      {tabs.length ? (
        <WorkspaceTabHost tabs={tabs} panels={panels} initialTab={params.tab} />
      ) : (
        <div style={emptyStateStyle}>Only the store owner can change settings.</div>
      )}
    </section>
  );
}
