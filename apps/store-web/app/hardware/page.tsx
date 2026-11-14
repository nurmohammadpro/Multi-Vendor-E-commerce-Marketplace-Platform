import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';
import { HardwareWorkspace } from './hardware-workspace';

export default async function HardwarePage() {
  const access = await getStoreConsoleAccess();
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      <HardwareWorkspace canManageSettings={access.canManageSettings} />
    </section>
  );
}
