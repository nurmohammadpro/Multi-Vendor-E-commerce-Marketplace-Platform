import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle, surfaceCardStyle } from '../marketone-theme';

import { ReceivablesWorkspace } from './receivables-workspace';

export default async function StoreReceivablesPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      {access.canUseReceivables ? (
        <ReceivablesWorkspace />
      ) : (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Receivables unavailable</h3>
          <div style={emptyStateStyle}>Your current role cannot open due collections.</div>
        </article>
      )}
    </section>
  );
}
