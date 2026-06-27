import { pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../motocore-theme';

import { ShippingWorkspace } from './shipping-workspace';

export default function StoreShippingPage() {
  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>Shipping</span>
        <h2 style={pageTitleStyle}>Shipping operations</h2>
        <p style={pageLeadStyle}>Shipment creation, courier assignment, tracking timeline, and status transitions run through live APIs.</p>
      </section>
      <ShippingWorkspace />
    </main>
  );
}
