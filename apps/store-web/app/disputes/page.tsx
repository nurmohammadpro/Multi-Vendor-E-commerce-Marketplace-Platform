import { Badge } from '@/components/ui/badge';

import { getStoreConsoleAccess } from '../../lib/access';
import { SupportWorkspace } from '../support/support-workspace';

export default async function StoreDisputesPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Disputes</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Return and refund disputes</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Basic stores can log return, refund, and walk-in customer issues here so the case history stays visible to both store and platform teams.
        </p>
      </section>
      <SupportWorkspace canUseSupport={access.canUseDisputes} kind="dispute" />
    </div>
  );
}
