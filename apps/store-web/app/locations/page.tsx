import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, pageTitleStyle, sectionLabelStyle } from '../marketone-theme';

import { LocationsWorkspace } from './locations-workspace';

export default async function StoreLocationsPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Locations</div>
        <h2 style={{ ...pageTitleStyle, margin: '8px 0' }}>Location management</h2>
      </div>
      <LocationsWorkspace canViewInventory={access.canViewInventory} canManageLocations={access.canDirectAdjustInventory} />
    </section>
  );
}
