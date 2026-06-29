import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../motocore-theme';
import { SupportWorkspace } from './support-workspace';

export default async function StoreSupportPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Support</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Store support desk</h2>
        <p style={tokenMutedStyle}>
          Operators can open technical, billing, and operational support threads without leaving the store console.
        </p>
      </div>
      <SupportWorkspace canUseSupport={access.canUseSupport} kind="support" />
    </section>
  );
}
