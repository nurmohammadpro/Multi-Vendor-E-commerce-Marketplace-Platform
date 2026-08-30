import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';
import { SupportWorkspace } from '../support/support-workspace';

export default async function StoreDisputesPage() {
  const access = await getStoreConsoleAccess();
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <SupportWorkspace canUseSupport={access.canUseDisputes} kind="dispute" />
    </section>
  );
}
