import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, pageTitleStyle, sectionLabelStyle, tokenMutedStyle } from '../marketone-theme';

import { ApprovalsWorkspace } from './approvals-workspace';

export default async function StoreApprovalsPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Approvals</div>
        <h2 style={{ ...pageTitleStyle, margin: '8px 0' }}>Owner approval queue</h2>
        <p style={tokenMutedStyle}>
          Review pending stock quantity changes and manager-requested price updates in one place.
        </p>
      </div>
      <ApprovalsWorkspace canApproveInventory={access.canApproveInventory} />
    </section>
  );
}
