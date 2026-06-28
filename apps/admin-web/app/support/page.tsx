import { SupportWorkspace } from './support-workspace';

export default function AdminSupportPage() {
  return (
    <main className="flex flex-col gap-6">
      <section className="max-w-[920px]">
        <h2 className="m-0 text-3xl font-semibold tracking-tight">Support and Disputes</h2>
        <p className="mt-2.5 leading-relaxed text-muted-foreground">
          This is the real support operations room: ticket triage, status updates, and ticket drilldowns all run from
          the live admin API.
        </p>
      </section>

      <SupportWorkspace />
    </main>
  );
}
