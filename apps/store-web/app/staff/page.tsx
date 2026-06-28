import { Badge } from '@/components/ui/badge';
import { getStoreConsoleAccess } from '../../lib/access';

import { StaffWorkspace } from './staff-workspace';

export default async function StoreStaffPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Staff</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Staff management</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Invite staff, assign roles, and monitor membership state through the live store APIs.
        </p>
      </section>
      <StaffWorkspace canManageStaff={access.canManageStaff} />
    </div>
  );
}
