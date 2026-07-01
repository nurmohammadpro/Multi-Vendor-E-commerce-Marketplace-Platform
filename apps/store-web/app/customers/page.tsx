import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../marketone-theme';
import { CustomersWorkspace } from './customers-workspace';

export default function StoreCustomersPage() {
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Customers</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Customer directory and due ledger</h2>
        <p style={tokenMutedStyle}>
          Track customer identity, shop details, due aging, and partial payment collection from one place.
        </p>
      </div>
      <CustomersWorkspace />
    </section>
  );
}
