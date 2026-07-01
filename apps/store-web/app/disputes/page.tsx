import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../marketone-theme';
import { SupportWorkspace } from '../support/support-workspace';

export default async function StoreDisputesPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Disputes</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Return and refund disputes</h2>
        <p style={tokenMutedStyle}>
          Basic stores can log return, refund, and walk-in customer issues here so the case history stays visible to both store and platform teams.
        </p>
      </div>
      <SupportWorkspace canUseSupport={access.canUseDisputes} kind="dispute" />
    </section>
  );
}
