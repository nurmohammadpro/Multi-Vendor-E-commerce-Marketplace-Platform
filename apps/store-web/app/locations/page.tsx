import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, sectionLabelStyle, tokenMutedStyle } from '../marketone-theme';

import { LocationsWorkspace } from './locations-workspace';

export default async function StoreLocationsPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Locations</div>
        <h2 style={{ margin: '8px 0 8px', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 500, letterSpacing: '-0.02em' }}>Location management</h2>
        <p style={tokenMutedStyle}>
          Manage inventory locations including address, phone, and contact details. Staff must be assigned to a location.
        </p>
      </div>
      <LocationsWorkspace canViewInventory={access.canViewInventory} canManageLocations={access.canDirectAdjustInventory} />
    </section>
  );
}
