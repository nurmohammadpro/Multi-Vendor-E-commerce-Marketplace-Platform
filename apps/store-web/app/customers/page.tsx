import { pageShellStyle } from '../merchflow-theme';
import { CustomersWorkspace } from './customers-workspace';

export default function StoreCustomersPage() {
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      <CustomersWorkspace />
    </section>
  );
}
