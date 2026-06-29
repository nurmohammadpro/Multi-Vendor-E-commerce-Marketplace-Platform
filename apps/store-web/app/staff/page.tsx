import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../motocore-theme';

import { StaffWorkspace } from './staff-workspace';

export default async function StoreStaffPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Staff</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Staff management</h2>
        <p style={tokenMutedStyle}>
          Invite staff, assign roles, and monitor membership state through the live store APIs.
        </p>
      </div>
      <StaffWorkspace canManageStaff={access.canManageStaff} />
    </section>
  );
}
