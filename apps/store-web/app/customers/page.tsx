import { pageShellStyle } from '../marketone-theme';
import { CustomersWorkspace } from './customers-workspace';

export default function StoreCustomersPage() {
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <CustomersWorkspace />
    </section>
  );
}
