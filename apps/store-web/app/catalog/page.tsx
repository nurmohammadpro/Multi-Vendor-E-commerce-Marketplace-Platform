import { getStoreConsoleAccess } from '@/lib/access';
import { CatalogWorkspace } from './catalog-workspace';

export default async function CatalogPage() {
  const access = await getStoreConsoleAccess();

  return <CatalogWorkspace canManageCatalog={access.canManageCatalog} />;
}
