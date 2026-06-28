import { Badge } from '@/components/ui/badge';
import { getStoreConsoleAccess } from '../../lib/access';

import { ShippingWorkspace } from './shipping-workspace';

export default async function StoreShippingPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Shipping</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Shipping operations</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Shipment creation, courier assignment, tracking timeline, and status transitions run through live APIs.
        </p>
      </section>
      <ShippingWorkspace canManageShipping={access.canManageShipping} canViewShipping={access.canViewReports} />
    </div>
  );
}
