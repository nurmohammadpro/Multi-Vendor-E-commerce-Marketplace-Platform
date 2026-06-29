import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageLeadStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../motocore-theme';
import { ActivityWorkspace } from './activity-workspace';

export default async function StoreActivityPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>Activity</span>
        <h2 style={pageTitleStyle}>Store audit trail</h2>
        <p style={pageLeadStyle}>
          Review operational history for sales, shipments, billing changes, inventory actions, and support activity.
        </p>
      </header>
      {access.canViewReports ? (
        <ActivityWorkspace />
      ) : (
        <div style={emptyStateStyle}>Your role does not have access to operational activity logs.</div>
      )}
    </section>
  );
}
