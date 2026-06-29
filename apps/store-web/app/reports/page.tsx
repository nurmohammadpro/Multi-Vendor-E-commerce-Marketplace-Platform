import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../motocore-theme';

import { ReportsWorkspace } from './reports-workspace';

export default async function StoreReportsPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Reports</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Store reports</h2>
        <p style={tokenMutedStyle}>
          Daily sales, inventory snapshots, and export jobs are available from the live reporting APIs.
        </p>
      </div>
      <ReportsWorkspace canViewReports={access.canViewReports} />
    </section>
  );
}
