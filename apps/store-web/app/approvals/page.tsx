import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';
import { ApprovalsWorkspace } from './approvals-workspace';

export default async function StoreApprovalsPage() {
  const access = await getStoreConsoleAccess();
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <ApprovalsWorkspace canApproveInventory={access.canApproveInventory} />
    </section>
  );
}
