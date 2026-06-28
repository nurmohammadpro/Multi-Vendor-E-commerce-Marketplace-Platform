import { Badge } from '@/components/ui/badge';
import { getStoreConsoleAccess } from '../../lib/access';
import { HardwareWorkspace } from './hardware-workspace';

export default async function HardwarePage() {
  const access = await getStoreConsoleAccess();

  return (
    <div className="flex flex-col gap-6">
      <section className="max-w-[900px]">
        <Badge variant="secondary" className="mb-3">Hardware</Badge>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight mb-2">
          Cashier workstation setup for printers, scanners, and drawer control.
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This page mirrors the local workstation setup pattern we verified from AxiomPos: the web app stays on the VPS,
          while receipt and label printing run through the cashier PC&apos;s local agent.
        </p>
      </section>

      <HardwareWorkspace canManageSettings={access.canManageSettings} />
    </div>
  );
}
