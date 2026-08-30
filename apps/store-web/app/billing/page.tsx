import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';
import { BillingWorkspace } from './billing-workspace';

export default async function StoreBillingPage() {
  const access = await getStoreConsoleAccess();
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <BillingWorkspace canManageBilling={access.canManageBilling} />
    </section>
  );
}
