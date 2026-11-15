import type { ReactNode } from 'react';

import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle } from '../merchflow-theme';
import { WorkspaceTabHost } from '../workspace-responsive';
import { ActivityWorkspace } from '../activity/activity-workspace';
import { ReportsWorkspace } from './reports-workspace';

export default async function StoreReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const access = await getStoreConsoleAccess();
  const params = (await searchParams) ?? {};

  const tabs: Array<{ key: string; label: string }> = [];
  const panels: Record<string, ReactNode> = {};

  if (access.canViewReports) {
    tabs.push({ key: 'reports', label: 'Reports' });
    panels.reports = <ReportsWorkspace canViewReports={access.canViewReports} />;
    tabs.push({ key: 'activity', label: 'Activity Log' });
    panels.activity = <ActivityWorkspace />;
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      {tabs.length ? (
        <WorkspaceTabHost tabs={tabs} panels={panels} initialTab={params.tab} />
      ) : (
        <div style={emptyStateStyle}>Your role does not have access to reports.</div>
      )}
    </section>
  );
}
