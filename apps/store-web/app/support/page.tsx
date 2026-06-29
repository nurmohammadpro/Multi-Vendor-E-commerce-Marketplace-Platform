import { Badge } from '@/components/ui/badge';

import { getStoreConsoleAccess } from '../../lib/access';
import { SupportWorkspace } from './support-workspace';

export default async function StoreSupportPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Support</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Store support desk</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Operators can open technical, billing, and operational support threads without leaving the store console.
        </p>
      </section>
      <SupportWorkspace canUseSupport={access.canUseSupport} kind="support" />
    </div>
  );
}
