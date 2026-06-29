import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../motocore-theme';

import { BillingWorkspace } from './billing-workspace';

export default async function StoreBillingPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Billing</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Billing and payments</h2>
        <p style={tokenMutedStyle}>
          Subscription plans, invoices, and payment recording run through the live billing APIs.
        </p>
      </div>
      <BillingWorkspace canManageBilling={access.canManageBilling} />
    </section>
  );
}
