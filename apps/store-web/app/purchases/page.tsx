import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle, surfaceCardStyle } from '../merchflow-theme';

import { PurchasesWorkspace } from './purchases-workspace';

export default async function StorePurchasesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const access = await getStoreConsoleAccess();
  const params = (await searchParams) ?? {};
  const initialTab = params.tab === 'suppliers' || params.tab === 'payables' ? params.tab : 'purchases';

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      {access.canUsePurchases ? (
        <PurchasesWorkspace initialTab={initialTab} />
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
