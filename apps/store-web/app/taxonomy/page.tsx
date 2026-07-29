import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../marketone-theme';
import { TaxonomyWorkspace } from './taxonomy-workspace';

export default async function StoreTaxonomyPage() {
  const access = await getStoreConsoleAccess();
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <TaxonomyWorkspace canManageCatalog={access.canManageCatalog} />
    </section>
  );
}
