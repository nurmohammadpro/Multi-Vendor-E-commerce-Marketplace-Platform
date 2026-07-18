import { pageShellStyle, pageTitleStyle, sectionLabelStyle, tokenMutedStyle } from '../marketone-theme';
import { CustomersWorkspace } from './customers-workspace';

export default function StoreCustomersPage() {
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Customers</div>
        <h2 style={{ ...pageTitleStyle, margin: '8px 0' }}>Customer directory and due ledger</h2>
        <p style={tokenMutedStyle}>
          Track customer identity, shop details, due aging, and partial payment collection from one place.
        </p>
      </div>
      <CustomersWorkspace />
    </section>
  );
}
