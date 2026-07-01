import { pageIntroCardStyle, pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../marketone-theme';
import { getStoreConsoleAccess } from '../../lib/access';

import { CatalogWorkspace } from './catalog-workspace';

export default async function StoreCatalogPage() {
  const access = await getStoreConsoleAccess();

  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={{ ...sectionIntroStyle, ...pageIntroCardStyle }}>
        <span style={sectionLabelStyle}>Catalog</span>
        <h2 style={pageTitleStyle}>Catalog workspace</h2>
        <p style={pageLeadStyle}>Manage products, variants, SKUs, and pricing through the live catalog APIs.</p>
      </section>
      <CatalogWorkspace
        canManageCatalog={access.canManageCatalog}
        canApprovePriceChanges={access.canApproveInventory}
      />
    </main>
  );
}
