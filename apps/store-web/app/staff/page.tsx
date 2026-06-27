import { pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../motocore-theme';

import { StaffWorkspace } from './staff-workspace';

export default function StoreStaffPage() {
  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>Staff</span>
        <h2 style={pageTitleStyle}>Staff management</h2>
        <p style={pageLeadStyle}>Invite staff, assign roles, and monitor membership state through the live store APIs.</p>
      </section>
      <StaffWorkspace />
    </main>
  );
}
