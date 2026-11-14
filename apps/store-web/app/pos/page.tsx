import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';

import { PosTerminal } from './pos-terminal';

export default async function StorePosPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      <PosTerminal canUsePos={access.canUsePos} canUseInvoices={access.canUseInvoices} />
    </section>
  );
}
