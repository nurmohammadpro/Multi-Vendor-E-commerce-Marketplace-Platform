import { NotificationsWorkspace } from './notifications-workspace';

export default function AdminNotificationsPage() {
  return (
    <main>
      <section className="mb-6">
        <h2 className="m-0 text-3xl font-semibold tracking-tight">Notifications and Broadcasts</h2>
        <p className="mt-2.5 max-w-[860px] leading-relaxed text-muted-foreground">
          This workspace now manages broadcast drafts, broadcast execution, queued notifications, and delivery
          processing through the live admin APIs.
        </p>
      </section>
      <NotificationsWorkspace />
    </main>
  );
}
