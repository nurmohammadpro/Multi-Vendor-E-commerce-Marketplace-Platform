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
          Cashier workstation setup for printers, scanners, and drawer control.
        </h2>
        <p style={tokenMutedStyle}>
          This page mirrors the local workstation setup pattern we verified from AxiomPos: the web app stays on the VPS,
          while receipt and label printing run through the cashier PC&apos;s local agent.
        </p>
      </div>

      <HardwareWorkspace canManageSettings={access.canManageSettings} />
    </section>
  );
}
