import { Badge } from '@/components/ui/badge';
import { getStoreConsoleAccess } from '../../lib/access';

import { BillingWorkspace } from './billing-workspace';

export default async function StoreBillingPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Billing</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Billing and payments</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Subscription plans, invoices, and payment recording run through the live billing APIs.
        </p>
      </section>
      <BillingWorkspace canManageBilling={access.canManageBilling} />
    </div>
  );
}
