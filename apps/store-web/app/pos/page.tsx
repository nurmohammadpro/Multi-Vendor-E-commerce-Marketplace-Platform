import { Badge } from '@/components/ui/badge';
import { getStoreConsoleAccess } from '../../lib/access';

import { PosTerminal } from './pos-terminal';

export default async function StorePosPage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">POS</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">POS terminal</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This POS surface talks to the live backend, supports barcode lookup, local printing, and cash drawer triggers.
        </p>
      </section>
      <PosTerminal canUsePos={access.canUsePos} />
    </div>
  );
}
