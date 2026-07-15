import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, pageTitleStyle, sectionLabelStyle, tokenMutedStyle } from '../marketone-theme';

import { StaffWorkspace } from './staff-workspace';

export default async function StoreStaffPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Staff</div>
        <h2 style={{ ...pageTitleStyle, margin: '8px 0' }}>Staff management</h2>
        <p style={tokenMutedStyle}>
          Invite staff, assign roles, and monitor membership state through the live store APIs.
        </p>
      </div>
      <StaffWorkspace canManageStaff={access.canManageStaff} />
    </section>
  );
}
