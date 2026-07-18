import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, pageTitleStyle, sectionLabelStyle, tokenMutedStyle } from '../marketone-theme';
import { HardwareWorkspace } from './hardware-workspace';

export default async function HardwarePage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Hardware</div>
        <h2 style={{ ...pageTitleStyle, margin: '8px 0' }}>
          Standard cashier workstation setup for printing and scanning.
        </h2>
        <p style={tokenMutedStyle}>
          We now support two standard hardware setups only: a POS counter setup with receipt printer and drawer support,
          or a laser counter setup with A4 printing. In both cases, the web app stays on the VPS while local printing runs through the cashier PC&apos;s agent.
        </p>
      </div>

      <HardwareWorkspace canManageSettings={access.canManageSettings} />
    </section>
  );
}
