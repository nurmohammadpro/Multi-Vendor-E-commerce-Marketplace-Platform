import Link from 'next/link';

import { fetchAdminApi, isAdminApiConfigured } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type AuditLogRow = {
  id: string;
  actor_user_id?: string | null;
  actor_type?: string | null;
  store_id?: string | null;
  action_code: string;
  resource_type?: string | null;
  resource_id?: string | null;
  created_at: string;
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const payload = await fetchAdminApi<{ logs?: AuditLogRow[] }>('/audit/logs');
  const rawLogs = payload?.logs ?? [];
  const configured = await isAdminApiConfigured();
  const query = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q.trim().toLowerCase() : '';
  const actorFilter = typeof resolvedSearchParams.actor === 'string' ? resolvedSearchParams.actor.trim().toLowerCase() : '';
  const storeFilter = typeof resolvedSearchParams.store === 'string' ? resolvedSearchParams.store.trim().toLowerCase() : '';
  const actionFilter = typeof resolvedSearchParams.action === 'string' ? resolvedSearchParams.action.trim().toLowerCase() : '';

  const logs = rawLogs.filter((row) => {
    const matchesQuery =
      !query
      || [row.action_code, row.actor_type, row.resource_type, row.resource_id, row.store_id]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    const matchesActor = !actorFilter || (row.actor_type || '').toLowerCase().includes(actorFilter);
    const matchesStore = !storeFilter || (row.store_id || '').toLowerCase().includes(storeFilter);
    const matchesAction = !actionFilter || row.action_code.toLowerCase().includes(actionFilter);
    return matchesQuery && matchesActor && matchesStore && matchesAction;
  });

  const actionCounts = logs.reduce<Record<string, number>>((counts, row) => {
    counts[row.action_code] = (counts[row.action_code] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <main className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 max-w-[900px]">
        <span className="text-xs font-bold tracking-[0.16em] uppercase text-muted-foreground">
          Audit surface
        </span>
        <h2 className="m-0 text-3xl font-semibold leading-tight tracking-tight">
          Trace the last important platform actions in one place.
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          This page closes the last big &quot;production gap&quot; by giving admins a direct audit trail for operational work.
        </p>
        <p className="text-sm text-muted-foreground">
          {configured
            ? 'Live audit data is connected.'
            : 'Set `API_BASE_URL` and `ADMIN_DEMO_BEARER_TOKEN` to enable live audit logs.'}
        </p>
      </section>

      <Card>
        <CardContent className="pt-[var(--erp-card-py)]">
          <form className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]" method="get">
            <Input name="q" placeholder="Search action, actor, resource, store" defaultValue={typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : ''} />
            <Input name="actor" placeholder="Actor type" defaultValue={typeof resolvedSearchParams.actor === 'string' ? resolvedSearchParams.actor : ''} />
            <Input name="store" placeholder="Store ID" defaultValue={typeof resolvedSearchParams.store === 'string' ? resolvedSearchParams.store : ''} />
            <Input name="action" placeholder="Action code" defaultValue={typeof resolvedSearchParams.action === 'string' ? resolvedSearchParams.action : ''} />
            <div className="flex gap-2">
              <Button type="submit">Filter</Button>
              <Button asChild variant="outline">
                <Link href="/audit">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Events
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">{logs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Most recent audit rows returned by the backend.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Action Types
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">{Object.keys(actionCounts).length}</div>
            <p className="text-xs text-muted-foreground mt-1">Distinct action codes in the current window.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Latest Event
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">{logs[0]?.action_code ?? '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {logs[0] ? new Date(logs[0].created_at).toLocaleString() : 'No audit events yet.'}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Recent events</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length ? (
              <div className="flex flex-col gap-2.5">
                {logs.slice(0, 12).map((log) => (
                  <Card key={log.id} className="!p-3.5">
                    <div className="font-semibold text-sm">{log.action_code}</div>
                    <div className="text-sm text-muted-foreground">
                      {log.actor_type || 'system'} · {log.resource_type || 'resource'}{log.resource_id ? ` · ${log.resource_id}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {log.actor_user_id || 'anonymous'} · {log.store_id || 'platform'} · {new Date(log.created_at).toLocaleString()}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-md border border-dashed border-border text-sm text-muted-foreground">
                {rawLogs.length ? 'No audit rows matched your filters.' : 'No audit rows have been recorded yet.'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permission gates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2.5">
              {permissionGates.map((gate) => (
                <Card key={gate.title} className="!p-3.5">
                  <div className="font-semibold text-sm">{gate.title}</div>
                  <div className="text-sm text-muted-foreground">{gate.permission}</div>
                  <div className="text-xs text-muted-foreground">{gate.description}</div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

const permissionGates = [
  {
    title: 'Platform reports',
    permission: 'platform.report.view',
    description: 'Admin analytics, audit trails, and cross-platform visibility.',
  },
  {
    title: 'Payments monitoring',
    permission: 'platform.payment.monitor',
    description: 'Invoice health, payment mix, and billing risk review.',
  },
  {
    title: 'Notifications',
    permission: 'platform.notification.manage',
    description: 'Broadcast composition and queue processing.',
  },
  {
    title: 'Store operations',
    permission: 'platform.store.manage',
    description: 'Merchant activation, suspension, and ownership review.',
  },
];
