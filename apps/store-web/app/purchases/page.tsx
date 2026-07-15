import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle, surfaceCardStyle } from '../marketone-theme';

import { PurchasesWorkspace } from './purchases-workspace';

export default async function StorePurchasesPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      {access.canUsePurchases ? (
        <PurchasesWorkspace />
      ) : (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Purchases locked</h3>
          <div style={emptyStateStyle}>
            Purchases are unavailable for this account right now. Check the user role permissions and store subscription settings.
          </div>
        </article>
      )}
    </section>
  );
}
