import { pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../motocore-theme';

import { PosTerminal } from './pos-terminal';

export default function StorePosPage() {
  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>POS</span>
        <h2 style={pageTitleStyle}>POS terminal</h2>
        <p style={pageLeadStyle}>This POS surface talks to the live backend, supports shift control, barcode lookup, and local printing.</p>
      </section>
      <PosTerminal />
    </main>
  );
}
