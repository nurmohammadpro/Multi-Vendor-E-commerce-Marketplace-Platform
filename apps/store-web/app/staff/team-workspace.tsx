'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkspaceTabs } from '../workspace-responsive';
import { PayrollWorkspace } from '../payroll/payroll-workspace';
import { StaffWorkspace } from './staff-workspace';

type TeamTab = 'users' | 'payroll';

export function TeamWorkspace({
  canManageStaff,
  canUsePayroll,
  initialTab = 'users',
}: {
  canManageStaff: boolean;
  canUsePayroll: boolean;
  initialTab?: TeamTab;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const availableTabs = useMemo(
    () =>
      [
        canManageStaff ? { key: 'users', label: 'Users' } : null,
        { key: 'payroll', label: 'HR & Payroll' },
      ].filter(Boolean) as Array<{ key: TeamTab; label: string }>,
    [canManageStaff],
  );

  const [activeTab, setActiveTab] = useState<TeamTab>(() => {
    if (initialTab === 'payroll') return 'payroll';
    return canManageStaff ? 'users' : 'payroll';
  });

  const handleTabChange = (next: TeamTab) => {
    setActiveTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  };

  return (
    <section className="grid gap-4">
      <WorkspaceTabs active={activeTab} onChange={(key) => handleTabChange(key as TeamTab)} tabs={availableTabs} />

      {activeTab === 'users' ? (
        canManageStaff ? (
          <StaffWorkspace canManageStaff={canManageStaff} embedded />
        ) : (
          <Card>
            <CardHeader><CardTitle>User access limited</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Only owners and managers can create or manage store users.</CardContent>
          </Card>
        )
      ) : canUsePayroll ? (
        <PayrollWorkspace embedded />
      ) : (
        <Card>
          <CardHeader><CardTitle>HR & Payroll locked</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Payroll remains available on the Pro plan for owner access only.</CardContent>
        </Card>
      )}
    </section>
  );
}
