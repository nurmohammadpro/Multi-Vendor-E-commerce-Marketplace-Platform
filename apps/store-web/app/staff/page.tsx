import { getStoreConsoleAccess } from '../../lib/access';
import { pageShellStyle } from '../merchflow-theme';
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
      <TeamWorkspace canManageStaff={access.canManageStaff} canUsePayroll={access.canUsePayroll} initialTab={initialTab} />
    </section>
  );
}
