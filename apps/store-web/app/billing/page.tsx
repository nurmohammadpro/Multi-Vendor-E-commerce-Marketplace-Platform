import { getStoreConsoleAccess } from '../../lib/access';
import { pageIntroCardStyle, pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../marketone-theme';

import { BillingWorkspace } from './billing-workspace';

export default async function StoreBillingPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ ...sectionIntroStyle, ...pageIntroCardStyle, maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Billing</div>
        <h2 style={pageTitleStyle}>Billing and payments</h2>
        <p style={pageLeadStyle}>
          Subscription plans, invoices, and payment recording run through the live billing APIs.
        </p>
      </div>
      <BillingWorkspace canManageBilling={access.canManageBilling} />
    </section>
  );
}
