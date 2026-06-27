import { pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../motocore-theme';
import { BillingWorkspace } from './billing-workspace';

export default function StoreBillingPage() {
  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>Billing</span>
        <h2 style={pageTitleStyle}>Billing and payments</h2>
        <p style={pageLeadStyle}>Subscription plans, invoices, and payment recording run through the live billing APIs.</p>
      </section>
      <BillingWorkspace />
    </main>
  );
}
