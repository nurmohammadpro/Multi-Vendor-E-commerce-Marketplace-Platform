import { getStoreConsoleAccess } from '../../lib/access';
import {
  emptyStateStyle,
  pageIntroCardStyle,
  pageLeadStyle,
  pageShellStyle,
  pageTitleStyle,
  sectionIntroStyle,
  sectionLabelStyle,
  surfaceCardStyle,
} from '../marketone-theme';

import { PurchasesWorkspace } from './purchases-workspace';

export default async function StorePurchasesPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ ...sectionIntroStyle, ...pageIntroCardStyle, maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Purchases</div>
        <h2 style={pageTitleStyle}>Supplier purchases and payables</h2>
        <p style={pageLeadStyle}>
          Receive supplier stock, keep purchase history clean, and track what the store still owes.
        </p>
      </div>
      {access.canUsePurchases ? (
        <PurchasesWorkspace />
      ) : (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Purchases locked</h3>
          <div style={emptyStateStyle}>Upgrade to Standard to manage suppliers, purchases, and supplier payables.</div>
        </article>
      )}
    </section>
  );
}
