import { getStoreConsoleAccess } from '../../lib/access';
import { pageIntroCardStyle, pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../marketone-theme';

import { PosTerminal } from './pos-terminal';

export default async function StorePosPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ ...sectionIntroStyle, ...pageIntroCardStyle, maxWidth: 900 }}>
        <div style={sectionLabelStyle}>POS</div>
        <h2 style={pageTitleStyle}>POS terminal</h2>
        <p style={pageLeadStyle}>
          This POS surface talks to the live backend, supports barcode lookup, local printing, and cash drawer triggers.
        </p>
      </div>
      <PosTerminal canUsePos={access.canUsePos} />
    </section>
  );
}
