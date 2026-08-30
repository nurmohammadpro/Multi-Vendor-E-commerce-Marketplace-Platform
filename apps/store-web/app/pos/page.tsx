import { getStoreConsoleAccess } from '../../lib/access';
import { pageIntroCardStyle, pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle } from '../merchflow-theme';

import { PosTerminal } from './pos-terminal';

export default async function StorePosPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <PosTerminal canUsePos={access.canUsePos} />
    </section>
  );
}
