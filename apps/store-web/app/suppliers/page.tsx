import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle, surfaceCardStyle } from '../merchflow-theme';
import { SuppliersWorkspace } from './suppliers-workspace';

export default async function StoreSuppliersPage() {
  const access = await getStoreConsoleAccess();
  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      {access.canUsePurchases ? (
        <SuppliersWorkspace />
      ) : (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Suppliers locked</h3>
          <div style={emptyStateStyle}>
            Supplier management is unavailable for this account right now. Check the user role permissions and store subscription settings.
          </div>
        </article>
      )}
    </section>
  );
}
