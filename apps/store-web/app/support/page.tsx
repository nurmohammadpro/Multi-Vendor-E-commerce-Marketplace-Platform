import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';
import { SupportWorkspace } from './support-workspace';

export default async function StoreSupportPage() {
  const access = await getStoreConsoleAccess();
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      <SupportWorkspace canUseSupport={access.canUseSupport} kind="support" />
    </section>
  );
}
