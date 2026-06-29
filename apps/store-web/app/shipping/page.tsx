import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../motocore-theme';

import { ShippingWorkspace } from './shipping-workspace';

export default async function StoreShippingPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Shipping</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Shipping operations</h2>
        <p style={tokenMutedStyle}>
          Shipment creation, courier assignment, tracking timeline, and status transitions run through live APIs.
        </p>
      </div>
      <ShippingWorkspace canManageShipping={access.canManageShipping} canViewShipping={access.canViewReports} />
    </section>
  );
}
