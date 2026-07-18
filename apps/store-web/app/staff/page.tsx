import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle, pageTitleStyle, sectionLabelStyle, tokenMutedStyle } from '../marketone-theme';
import { TeamWorkspace } from './team-workspace';

export default async function StoreStaffPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const access = await getStoreConsoleAccess();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = resolvedSearchParams?.tab === 'payroll' ? 'payroll' : 'users';

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <div style={{ maxWidth: 900 }}>
        <div style={sectionLabelStyle}>Team</div>
        <h2 style={{ ...pageTitleStyle, margin: '8px 0' }}>Users, employees, and payroll</h2>
        <p style={tokenMutedStyle}>
          Manage console users, employee records, and payroll workflow from one focused team workspace.
        </p>
      </div>
      <TeamWorkspace canManageStaff={access.canManageStaff} canUsePayroll={access.canUsePayroll} initialTab={initialTab} />
    </section>
  );
}
