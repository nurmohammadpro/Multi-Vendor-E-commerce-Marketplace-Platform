import { pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle, surfaceCardStyle, tokenMutedStyle } from '../motocore-theme';

export default function StoreSettingsPage() {
  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>Store settings</span>
        <h2 style={pageTitleStyle}>Keep the operational defaults compact and predictable.</h2>
        <p style={pageLeadStyle}>
          Timezone, currency, invoice prefix, receipt footer, policy preferences, and stock controls live here.
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Operational defaults</h3>
          <p style={tokenMutedStyle}>
            Store timezone, base currency, invoice numbering, and receipt footer text are set here so the POS and
            billing flows stay consistent.
          </p>
        </article>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Policy controls</h3>
          <p style={tokenMutedStyle}>
            Approval thresholds, low-stock alerts, and stock adjustment behavior belong here, with tighter control for
            managers and owners.
          </p>
        </article>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Print and receipt</h3>
          <p style={tokenMutedStyle}>
            Keep receipt format, footer copy, printer routing, and label defaults in one place so POS output stays
            predictable in every lane.
          </p>
        </article>
      </section>
    </main>
  );
}
