import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, pageTitleStyle, sectionLabelStyle, tokenMutedStyle } from '../marketone-theme';

import { TaxonomyWorkspace } from './taxonomy-workspace';

export default async function StoreTaxonomyPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Categories &amp; Brands</div>
        <h2 style={{ ...pageTitleStyle, margin: '8px 0' }}>Product taxonomy management</h2>
        <p style={tokenMutedStyle}>
          Create and manage product categories and brands. Categories support hierarchical parent-child relationships.
        </p>
      </div>
      <TaxonomyWorkspace canManageCatalog={access.canManageCatalog} />
    </section>
  );
}
