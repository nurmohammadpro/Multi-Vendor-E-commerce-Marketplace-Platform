import { getStoreConsoleAccess } from '../../lib/access';
import { pageIntroCardStyle, pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../marketone-theme';

import { ShippingWorkspace } from './shipping-workspace';

export default async function StoreShippingPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ ...sectionIntroStyle, ...pageIntroCardStyle, maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Shipping</div>
        <h2 style={pageTitleStyle}>Shipping operations</h2>
        <p style={pageLeadStyle}>
          Shipment creation, courier assignment, tracking timeline, and status transitions run through live APIs.
        </p>
      </div>
      <ShippingWorkspace canManageShipping={access.canManageShipping} canViewShipping={access.canViewReports} />
    </section>
  );
}
