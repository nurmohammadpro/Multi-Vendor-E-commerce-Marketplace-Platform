import Link from 'next/link';

import { fetchAdminApi, isAdminApiConfigured } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

type SortField = 'created_at' | 'action_code' | 'resource_type' | 'actor_type';

const LIMIT = 15;

function humanizeAuditCode(value: string) {
  return value
    .replaceAll(/[._]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function truncateId(id?: string | null, len = 10) {
  if (!id) return '—';
  return id.length > len ? `${id.slice(0, len)}…` : id;
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const payload = await fetchAdminApi<{ logs?: AuditLogRow[] }>('/audit/logs');
  const rawLogs = payload?.logs ?? [];
  const configured = await isAdminApiConfigured();

  // Read filters from URL
  const query = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q.trim().toLowerCase() : '';
  const actorFilter = typeof resolvedSearchParams.actor === 'string' ? resolvedSearchParams.actor.trim().toLowerCase() : '';
  const storeFilter = typeof resolvedSearchParams.store === 'string' ? resolvedSearchParams.store.trim().toLowerCase() : '';
  const actionFilter = typeof resolvedSearchParams.action === 'string' ? resolvedSearchParams.action.trim().toLowerCase() : '';

  // Read sort from URL
  const validSortFields: SortField[] = ['created_at', 'action_code', 'resource_type', 'actor_type'];
  const sortBy = (typeof resolvedSearchParams.sortBy === 'string' && validSortFields.includes(resolvedSearchParams.sortBy as SortField))
    ? (resolvedSearchParams.sortBy as SortField)
    : 'created_at';
  const sortDir = typeof resolvedSearchParams.sortDir === 'string' && resolvedSearchParams.sortDir === 'asc' ? 'asc' : 'desc';

  // Read page from URL
  const rawPage = typeof resolvedSearchParams.page === 'string' ? parseInt(resolvedSearchParams.page, 10) : 1;
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;

  // Build a reusable URL helper that preserves existing params
  const buildUrl = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const current: Record<string, string> = {};
    if (resolvedSearchParams.q) current.q = String(resolvedSearchParams.q);
    if (resolvedSearchParams.actor) current.actor = String(resolvedSearchParams.actor);
    if (resolvedSearchParams.store) current.store = String(resolvedSearchParams.store);
    if (resolvedSearchParams.action) current.action = String(resolvedSearchParams.action);
    if (resolvedSearchParams.sortBy) current.sortBy = String(resolvedSearchParams.sortBy);
    if (resolvedSearchParams.sortDir) current.sortDir = String(resolvedSearchParams.sortDir);
    if (resolvedSearchParams.page) current.page = String(resolvedSearchParams.page);
    for (const [key, value] of Object.entries({ ...current, ...overrides })) {
      if (value !== null) params.set(key, value);
    }
    return `/audit?${params.toString()}`;
  };

  // Filter logs
  const filteredLogs = rawLogs.filter((row) => {
    const matchesQuery =
      !query ||
      [row.action_code, row.actor_type, row.resource_type, row.resource_id, row.store_id]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    const matchesActor = !actorFilter || (row.actor_type || '').toLowerCase().includes(actorFilter);
    const matchesStore = !storeFilter || (row.store_id || '').toLowerCase().includes(storeFilter);
    const matchesAction = !actionFilter || row.action_code.toLowerCase().includes(actionFilter);
    return matchesQuery && matchesActor && matchesStore && matchesAction;
  });

  // Sort logs
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'created_at':
        cmp = a.created_at.localeCompare(b.created_at);
        break;
      case 'action_code':
        cmp = a.action_code.localeCompare(b.action_code);
        break;
      case 'resource_type':
        cmp = (a.resource_type || '').localeCompare(b.resource_type || '');
        break;
      case 'actor_type':
        cmp = (a.actor_type || '').localeCompare(b.actor_type || '');
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Paginate logs
  const totalLogs = sortedLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / LIMIT));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * LIMIT;
  const pageLogs = sortedLogs.slice(startIndex, startIndex + LIMIT);

  // Stats
  const actionCounts = filteredLogs.reduce<Record<string, number>>((counts, row) => {
    counts[row.action_code] = (counts[row.action_code] ?? 0) + 1;
    return counts;
  }, {});

  const sortIndicator = (field: SortField) => {
    if (sortBy !== field) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <main className="flex flex-col gap-6">
      {/* Header */}
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

      {/* Filters */}
      <Card>
        <CardContent className="pt-[var(--erp-card-py)]">
          <form className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]" method="get">
            <Input
              name="q"
              placeholder="Search action, actor, resource, store"
              defaultValue={typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : ''}
            />
            <Input
              name="actor"
              placeholder="Actor type"
              defaultValue={typeof resolvedSearchParams.actor === 'string' ? resolvedSearchParams.actor : ''}
            />
            <Input
              name="store"
              placeholder="Store ID"
              defaultValue={typeof resolvedSearchParams.store === 'string' ? resolvedSearchParams.store : ''}
            />
            <Input
              name="action"
              placeholder="Action code"
              defaultValue={typeof resolvedSearchParams.action === 'string' ? resolvedSearchParams.action : ''}
            />
            <div className="flex gap-2">
              <Button type="submit">Filter</Button>
              <Button asChild variant="outline">
                <Link href="/audit">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Stats cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Events
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">{filteredLogs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Filtered from {rawLogs.length} total audit rows.</p>
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
            <p className="text-xs text-muted-foreground mt-1">Distinct action codes in the current filter.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Latest Event
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">{filteredLogs[0]?.action_code ?? '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredLogs[0] ? new Date(filteredLogs[0].created_at).toLocaleString() : 'No audit events yet.'}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Audit trail table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Audit trail</CardTitle>
          <span className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages} &middot; {totalLogs} total
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table style={{ tableLayout: 'fixed' }}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[15%]">
                  <Link
                    href={buildUrl({ sortBy: 'created_at', sortDir: sortBy === 'created_at' && sortDir === 'asc' ? 'desc' : 'asc', page: '1' })}
                    className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors no-underline"
                  >
                    Time{sortIndicator('created_at')}
                  </Link>
                </TableHead>
                <TableHead className="w-[18%]">
                  <Link
                    href={buildUrl({ sortBy: 'action_code', sortDir: sortBy === 'action_code' && sortDir === 'asc' ? 'desc' : 'asc', page: '1' })}
                    className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors no-underline"
                  >
                    Action{sortIndicator('action_code')}
                  </Link>
                </TableHead>
                <TableHead className="w-[12%]">
                  <Link
                    href={buildUrl({ sortBy: 'resource_type', sortDir: sortBy === 'resource_type' && sortDir === 'asc' ? 'desc' : 'asc', page: '1' })}
                    className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors no-underline"
                  >
                    Resource{sortIndicator('resource_type')}
                  </Link>
                </TableHead>
                <TableHead className="w-[20%]">Record</TableHead>
                <TableHead className="w-[18%]">
                  <Link
                    href={buildUrl({ sortBy: 'actor_type', sortDir: sortBy === 'actor_type' && sortDir === 'asc' ? 'desc' : 'asc', page: '1' })}
                    className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors no-underline"
                  >
                    Actor{sortIndicator('actor_type')}
                  </Link>
                </TableHead>
                <TableHead className="w-[17%]">Store</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageLogs.length ? (
                pageLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium">{humanizeAuditCode(log.action_code)}</TableCell>
                    <TableCell className="text-muted-foreground">{humanizeAuditCode(log.resource_type || '')}</TableCell>
                    <TableCell
                      className="font-mono text-xs max-w-0 truncate overflow-hidden text-ellipsis whitespace-nowrap"
                      title={log.resource_id || ''}
                    >
                      {truncateId(log.resource_id)}
                    </TableCell>
                    <TableCell>
                      <span
                        className="max-w-0 truncate overflow-hidden text-ellipsis whitespace-nowrap block"
                        title={`${log.actor_type || 'system'}${log.actor_user_id ? ` · ${log.actor_user_id}` : ''}`}
                      >
                        {log.actor_type || 'system'}
                        {log.actor_user_id ? ` · ${truncateId(log.actor_user_id, 8)}` : ''}
                      </span>
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs max-w-0 truncate overflow-hidden text-ellipsis whitespace-nowrap"
                      title={log.store_id || ''}
                    >
                      {log.store_id ? truncateId(log.store_id, 8) : 'platform'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {rawLogs.length
                      ? 'No audit rows matched your filters.'
                      : 'No audit rows have been recorded yet.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">
                Showing {startIndex + 1}–{Math.min(startIndex + LIMIT, totalLogs)} of {totalLogs}
              </span>
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildUrl({ page: String(currentPage - 1) })}>Previous</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled className="opacity-50 cursor-not-allowed">
                    Previous
                  </Button>
                )}
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        asChild
                        variant={pageNum === currentPage ? 'default' : 'outline'}
                        size="sm"
                        className="min-w-[32px]"
                      >
                        <Link href={buildUrl({ page: String(pageNum) })}>{pageNum}</Link>
                      </Button>
                    );
                  })}
                </div>
                {currentPage < totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildUrl({ page: String(currentPage + 1) })}>Next</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled className="opacity-50 cursor-not-allowed">
                    Next
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Permission gates */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        <Card>
          <CardHeader>
            <CardTitle>About this page</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
              <p>
                The audit trail shows platform-level actions across all stores.
                Click column headers to sort, use the filters above to narrow results.
              </p>
              <p>
                Records are paginated ({LIMIT} per page). The stats cards reflect the
                current filtered set, not the raw total.
              </p>
              <p className="text-xs">
                Data source: <code className="text-xs bg-muted px-1 rounded">audit.logs</code> table,
                fetched via <code className="text-xs bg-muted px-1 rounded">/audit/logs</code>.
              </p>
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
