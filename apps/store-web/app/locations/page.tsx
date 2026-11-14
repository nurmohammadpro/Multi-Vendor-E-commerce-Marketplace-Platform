import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';
import { LocationsWorkspace } from './locations-workspace';

export default async function StoreLocationsPage() {
  const access = await getStoreConsoleAccess();
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
      <LocationsWorkspace canViewInventory={access.canViewInventory} canManageLocations={access.canManageLocations} />
    </section>
  );
}
