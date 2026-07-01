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
} from '../motocore-theme';

import { ReceivablesWorkspace } from './receivables-workspace';

export default async function StoreReceivablesPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ ...sectionIntroStyle, ...pageIntroCardStyle, maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Receivables</div>
        <h2 style={pageTitleStyle}>Due collections and aging</h2>
        <p style={pageLeadStyle}>
          Follow open customer dues, aging buckets, and payment collections from one focused surface.
        </p>
      </div>
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
