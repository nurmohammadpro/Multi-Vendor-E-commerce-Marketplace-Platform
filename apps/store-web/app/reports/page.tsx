import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';
import { ReportsWorkspace } from './reports-workspace';

export default async function StoreReportsPage() {
  const access = await getStoreConsoleAccess();
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <ReportsWorkspace canViewReports={access.canViewReports} />
    </section>
  );
}
