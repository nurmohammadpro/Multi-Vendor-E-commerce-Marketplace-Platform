import { Badge } from '@/components/ui/badge';

import { CustomersWorkspace } from './customers-workspace';

export default function StoreCustomersPage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Customers</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">Customer directory and due ledger</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Track customer identity, shop details, due aging, and partial payment collection from one place.
        </p>
      </section>
      <CustomersWorkspace />
    </div>
  );
}
