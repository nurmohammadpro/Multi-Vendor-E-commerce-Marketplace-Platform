import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle, pageTitleStyle, sectionLabelStyle, surfaceCardStyle, tokenMutedStyle } from '../marketone-theme';

import { SuppliersWorkspace } from './suppliers-workspace';

export default async function StoreSuppliersPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Suppliers</div>
        <h2 style={{ ...pageTitleStyle, margin: '8px 0' }}>Supplier directory and payable ledger</h2>
        <p style={tokenMutedStyle}>
          Manage suppliers, track contact information, view payable balances, and generate supplier ledger reports.
        </p>
      </div>
      {access.canUsePurchases ? (
        <SuppliersWorkspace />
      ) : (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Suppliers locked</h3>
          <div style={emptyStateStyle}>
            Supplier management is unavailable for this account right now. Check the user role permissions and store subscription settings.
          </div>
        </article>
      )}
    </section>
  );
}
