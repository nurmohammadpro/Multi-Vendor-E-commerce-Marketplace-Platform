import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../marketone-theme';
import { SupportWorkspace } from './support-workspace';

export default async function StoreSupportPage() {
  const access = await getStoreConsoleAccess();
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <SupportWorkspace canUseSupport={access.canUseSupport} kind="support" />
    </section>
  );
}
