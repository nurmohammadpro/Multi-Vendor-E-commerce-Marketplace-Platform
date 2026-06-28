import { Badge } from '@/components/ui/badge';

import { PosTerminal } from './pos-terminal';

export default function StorePosPage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">POS</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">POS terminal</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This POS surface talks to the live backend, supports shift control, barcode lookup, and local printing.
        </p>
      </section>
      <PosTerminal />
    </div>
  );
}
