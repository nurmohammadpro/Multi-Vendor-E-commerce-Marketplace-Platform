import { pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../motocore-theme';

import { ReportsWorkspace } from './reports-workspace';

export default function StoreReportsPage() {
  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>Reports</span>
        <h2 style={pageTitleStyle}>Store reports</h2>
        <p style={pageLeadStyle}>Daily sales, inventory snapshots, and export jobs are available from the live reporting APIs.</p>
      </section>
      <ReportsWorkspace />
    </main>
  );
}
