import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle } from '../merchflow-theme';
import { ActivityWorkspace } from './activity-workspace';

export default async function StoreActivityPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      {access.canViewReports ? (
        <ActivityWorkspace />
      ) : (
        <div style={emptyStateStyle}>Your role does not have access to operational activity logs.</div>
      )}
    </section>
  );
}
