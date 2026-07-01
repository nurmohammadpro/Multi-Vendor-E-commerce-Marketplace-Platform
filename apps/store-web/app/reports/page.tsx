import { getStoreConsoleAccess } from '../../lib/access';
import { pageIntroCardStyle, pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../marketone-theme';

import { ReportsWorkspace } from './reports-workspace';

export default async function StoreReportsPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ ...sectionIntroStyle, ...pageIntroCardStyle, maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Reports</div>
        <h2 style={pageTitleStyle}>Store reports</h2>
        <p style={pageLeadStyle}>
          Daily sales, inventory snapshots, and export jobs are available from the live reporting APIs.
        </p>
      </div>
      <ReportsWorkspace canViewReports={access.canViewReports} />
    </section>
  );
}
