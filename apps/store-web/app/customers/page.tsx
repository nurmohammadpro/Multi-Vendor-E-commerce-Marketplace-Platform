import { pageShellStyle, pageTitleStyle, sectionLabelStyle } from '../marketone-theme';
import { CustomersWorkspace } from './customers-workspace';

export default function StoreCustomersPage() {
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Customers</div>
        <h2 style={{ ...pageTitleStyle, margin: '8px 0' }}>Customer directory and due ledger</h2>
      </div>
      <CustomersWorkspace />
    </section>
  );
}
