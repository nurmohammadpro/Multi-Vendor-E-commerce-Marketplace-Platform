import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageShellStyle, surfaceCardStyle } from '../marketone-theme';
import { ExpensesWorkspace } from './expenses-workspace';

export default async function StoreExpensesPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      {access.canUseDailyExpense ? (
        <ExpensesWorkspace />
      ) : (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Daily Expense locked</h3>
          <div style={emptyStateStyle}>Upgrade to Standard to use this workflow.</div>
        </article>
      )}
    </section>
  );
}
