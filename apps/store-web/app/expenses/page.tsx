import { getStoreConsoleAccess } from '../../lib/access';
import { emptyStateStyle, pageIntroCardStyle, pageLeadStyle, pageShellStyle, pageTitleStyle, sectionIntroStyle, sectionLabelStyle, surfaceCardStyle } from '../marketone-theme';
import { ExpensesWorkspace } from './expenses-workspace';

export default async function StoreExpensesPage() {
  const access = await getStoreConsoleAccess();

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ ...sectionIntroStyle, ...pageIntroCardStyle, maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Daily Expense</div>
        <h2 style={pageTitleStyle}>Daily expense control</h2>
        <p style={pageLeadStyle}>
          Record, review, and update day-level operating expenses for the store.
        </p>
      </div>
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
