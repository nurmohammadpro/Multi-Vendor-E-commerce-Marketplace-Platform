import { StoresWorkspace } from './stores-workspace';

export default function AdminStoresPage() {
  return (
    <main>
      <section className="mb-6">
        <h2 className="m-0 text-3xl font-semibold tracking-tight">Store Operations</h2>
        <p className="mt-2.5 max-w-[860px] leading-relaxed text-muted-foreground">
          Platform admins can now review stores, inspect ownership and staffing, and apply activation or suspension
          decisions from a live operational queue.
        </p>
      </section>
      <StoresWorkspace />
    </main>
  );
}
