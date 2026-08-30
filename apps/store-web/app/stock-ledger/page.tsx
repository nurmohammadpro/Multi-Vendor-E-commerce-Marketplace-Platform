import { pageShellStyle } from '../merchflow-theme';
import { StockLedgerWorkspace } from './stock-ledger-workspace';

export default async function StockLedgerPage() {
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <StockLedgerWorkspace />
    </section>
  );
}
