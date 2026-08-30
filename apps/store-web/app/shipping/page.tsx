import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';

import { ShippingWorkspace } from './shipping-workspace';

export default async function StoreShippingPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <ShippingWorkspace canManageShipping={access.canManageShipping} canViewShipping={access.canViewReports} />
    </section>
  );
}
