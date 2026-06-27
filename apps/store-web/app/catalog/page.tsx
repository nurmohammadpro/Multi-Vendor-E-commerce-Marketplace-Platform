import { pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../motocore-theme';

import { CatalogWorkspace } from './catalog-workspace';

export default function StoreCatalogPage() {
  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>Catalog</span>
        <h2 style={pageTitleStyle}>Catalog workspace</h2>
        <p style={pageLeadStyle}>Manage products, variants, SKUs, and pricing through the live catalog APIs.</p>
      </section>
      <CatalogWorkspace />
    </main>
  );
}
