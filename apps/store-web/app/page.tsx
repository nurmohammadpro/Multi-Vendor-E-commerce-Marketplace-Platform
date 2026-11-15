import { getStoreConsoleAccess } from '../lib/access';
import { fetchStoreApi, isStoreApiConfigured } from '../lib/api';
import { pageShellStyle, pageTitleStyle, tokenMutedStyle } from './merchflow-theme';
import { DealerDashboardPanel } from './dealer-dashboard-panel';

type PendingAdjustmentsPayload = { adjustmentRequests?: Array<unknown> };

export default async function StoreDashboard() {
  const access = await getStoreConsoleAccess();
  const apiAvailable = await isStoreApiConfigured();

  let pendingApprovals: number | null = null;
  if (apiAvailable) {
    try {
      const approvalsPayload = await fetchStoreApi<PendingAdjustmentsPayload>('/inventory/adjustments?status=pending&limit=50');
      pendingApprovals = approvalsPayload?.adjustmentRequests?.length ?? 0;
    } catch {
      pendingApprovals = null;
    }
  }

  return (
    <div style={pageShellStyle}>
      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...pageTitleStyle, marginBottom: 6 }}>
            {access.storeName || 'Store Dashboard'}
          </h1>
          <p style={{ ...tokenMutedStyle, margin: 0 }}>{access.planName} plan · {access.role} access</p>
        </div>
        {pendingApprovals !== null && pendingApprovals > 0 ? (
          <a href="/inventory?tab=approvals" style={{ fontSize: 12, color: '#b45309', textDecoration: 'none' }}>
            {pendingApprovals} pending approval{pendingApprovals === 1 ? '' : 's'} →
          </a>
        ) : null}
      </div>

      {apiAvailable && access.canViewReports ? (
        <DealerDashboardPanel />
      ) : apiAvailable ? (
        <div style={{ ...tokenMutedStyle, padding: 8 }}>Your role does not have access to business reports.</div>
      ) : (
        <div style={{ ...tokenMutedStyle, padding: 8 }}>Connect the store API to see live business figures.</div>
      )}
    </div>
  );
}
