import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../motocore-theme';

import { ApprovalsWorkspace } from './approvals-workspace';

export default async function StoreApprovalsPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Approvals</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Owner approval queue</h2>
        <p style={tokenMutedStyle}>
          Review pending stock quantity changes and manager-requested price updates in one place.
        </p>
      </div>
      <ApprovalsWorkspace canApproveInventory={access.canApproveInventory} />
    </section>
  );
}
