import { pageShellStyle } from '../marketone-theme';
import { getStoreConsoleAccess } from '../../lib/access';
import { CatalogWorkspace } from './catalog-workspace';

export default async function StoreCatalogPage() {
  const access = await getStoreConsoleAccess();
  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <CatalogWorkspace canManageCatalog={access.canManageCatalog} canApprovePriceChanges={access.canApproveInventory} />
    </main>
  );
}
