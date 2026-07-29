import { StoresWorkspace } from './stores-workspace';

export default function AdminStoresPage() {
  return (
    <main>
      <section className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="m-0 text-3xl font-semibold tracking-tight">Store Operations</h2>
            <p className="mt-2 max-w-[860px] leading-relaxed text-muted-foreground">
              Create and manage stores, review ownership and staffing, and apply activation or suspension decisions.
            </p>
          </div>
        </div>
      </section>
      <StoresWorkspace />
    </main>
  );
}
