'use client';

import { useEffect, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  searchButtonStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../merchflow-theme';

type AuditLog = {
  id: string;
  actor_user_id?: string | null;
  actor_type: string;
  store_id?: string | null;
  action_code: string;
  resource_type: string;
  resource_id?: string | null;
  before_json?: Record<string, unknown> | null;
  after_json?: Record<string, unknown> | null;
  created_at: string;
};

type AuditPayload = {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function ActivityWorkspace() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [message, setMessage] = useState('Operational activity is loading.');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actionCode, setActionCode] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  const refresh = async (nextPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(pagination.limit),
      });
      if (search.trim()) params.set('search', search.trim());
      if (actionCode.trim()) params.set('actionCode', actionCode.trim());
      if (resourceType.trim()) params.set('resourceType', resourceType.trim());
      const payload = await readJson<AuditPayload>(`/api/audit/logs?${params.toString()}`);
      setLogs(payload.logs ?? []);
      setPagination(payload.pagination ?? { page: nextPage, limit: 20, total: payload.logs?.length ?? 0 });
      setPage(payload.pagination?.page ?? nextPage);
      setMessage(`Loaded ${payload.logs?.length ?? 0} audit records.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20)));

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 10 }}>
      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Activity filters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(2, minmax(180px, 1fr)) auto', gap: 10 }}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} style={fieldStyle} placeholder="Search action, resource, or record id" />
          <input value={actionCode} onChange={(event) => setActionCode(event.target.value)} style={fieldStyle} placeholder="Action code" />
          <input value={resourceType} onChange={(event) => setResourceType(event.target.value)} style={fieldStyle} placeholder="Resource type" />
          <button onClick={() => void refresh(1)} style={searchButtonStyle} disabled={loading}>Apply</button>
        </div>
      </article>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Audit trail</h3>
        {logs.length ? (
          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCellStyle, width: '15%' }}>Time</th>
                  <th style={{ ...tableHeaderCellStyle, width: '13%' }}>Action</th>
                  <th style={{ ...tableHeaderCellStyle, width: '12%' }}>Resource</th>
                  <th style={{ ...tableHeaderCellStyle, width: '20%' }}>Record</th>
                  <th style={{ ...tableHeaderCellStyle, width: '16%' }}>Actor</th>
                  <th style={{ ...tableHeaderCellStyle, width: '24%' }}>After</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={tableCellStyle}>{new Date(log.created_at).toLocaleString()}</td>
                    <td style={tableCellStyle}>{humanizeAuditCode(log.action_code)}</td>
                    <td style={tableCellStyle}>{humanizeAuditCode(log.resource_type)}</td>
                    <td style={{ ...tableCellStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0 }} title={log.resource_id || '—'}>
                      {log.resource_id || '—'}
                    </td>
                    <td style={{ ...tableCellStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0 }} title={`${log.actor_type}${log.actor_user_id ? ` · ${log.actor_user_id}` : ''}`}>
                      {log.actor_type}{log.actor_user_id ? ` · ${log.actor_user_id}` : ''}
                    </td>
                    <td style={tableCellStyle}>
                      <AuditAfterCell value={log.after_json} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={emptyStateStyle}>No audit logs matched the current filters.</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12 }}>
          <span style={tokenMutedStyle}>Page {page} of {totalPages} · {pagination.total} total record(s)</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void refresh(Math.max(1, page - 1))} style={secondaryButtonStyle} disabled={loading || page <= 1}>Previous</button>
            <button onClick={() => void refresh(Math.min(totalPages, page + 1))} style={secondaryButtonStyle} disabled={loading || page >= totalPages}>Next</button>
          </div>
        </div>
      </article>

      <p style={tokenMutedStyle}>{message}</p>
    </section>
  );
}

function AuditAfterCell({ value }: { value?: Record<string, unknown> | null }) {
  if (!value || !Object.keys(value).length) {
    return <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>No recorded field changes</span>;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== '')
    .slice(0, 6);

  if (!entries.length) {
    return <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>No recorded field changes</span>;
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {entries.map(([key, entryValue]) => (
        <div
          key={key}
          style={{
            display: 'grid',
            gridTemplateColumns: '110px minmax(0, 1fr)',
            gap: 8,
            alignItems: 'start',
            fontSize: 12,
          }}
        >
          <span
            style={{
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: 11,
            }}
          >
            {humanizeAuditKey(key)}
          </span>
          <span style={{ color: 'var(--foreground)', wordBreak: 'break-word' }}>
            {formatAuditValue(entryValue)}
          </span>
        </div>
      ))}
      {Object.keys(value).length > entries.length ? (
        <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>
          +{Object.keys(value).length - entries.length} more field(s)
        </span>
      ) : null}
    </div>
  );
}

function humanizeAuditKey(key: string) {
  return key
    .replaceAll(/_/g, ' ')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function humanizeAuditCode(value: string) {
  return humanizeAuditKey(value.replaceAll('.', ' '))
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAuditValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    return value
      .slice(0, 3)
      .map((item) => formatAuditValue(item))
      .join(', ')
      + (value.length > 3 ? ` +${value.length - 3} more` : '');
  }
  if (typeof value === 'object') {
    const objectEntries = Object.entries(value as Record<string, unknown>).slice(0, 3);
    if (!objectEntries.length) return '—';
    return objectEntries
      .map(([entryKey, entryValue]) => `${humanizeAuditKey(entryKey)}: ${formatAuditValue(entryValue)}`)
      .join(' · ');
  }
  return String(value);
}
