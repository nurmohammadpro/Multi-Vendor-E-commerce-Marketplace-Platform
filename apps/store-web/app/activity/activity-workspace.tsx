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
} from '../marketone-theme';

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
    <section style={{ ...pageShellStyle, display: 'grid', gap: 24 }}>
      {/* Header Section */}
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(24px, 2.2vw, 32px)', lineHeight: 1.1, letterSpacing: '-0.03em', fontWeight: 500 }}>
          Activity Log
        </h1>
        <p style={{ ...tokenMutedStyle, margin: 0 }}>
          Track system activities, user actions, and operational events for transparency and audit.
        </p>
      </div>

      {/* Professional Filter Section */}
      <article style={{ ...surfaceCardStyle, background: 'var(--muted)', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Filter Activities</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
              Search and filter through system activity logs
            </p>
          </div>
          <button onClick={() => { setSearch(''); setActionCode(''); setResourceType(''); void refresh(1); }} style={{ ...secondaryButtonStyle, fontSize: 12 }}>
            Clear Filters
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)) auto', gap: 12 }}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} style={{ ...fieldStyle, padding: '10px 12px', fontSize: 13 }} placeholder="🔍 Search action, resource, or record ID" />
          <input value={actionCode} onChange={(event) => setActionCode(event.target.value)} style={{ ...fieldStyle, padding: '10px 12px', fontSize: 13 }} placeholder="⚡ Action code" />
          <input value={resourceType} onChange={(event) => setResourceType(event.target.value)} style={{ ...fieldStyle, padding: '10px 12px', fontSize: 13 }} placeholder="📁 Resource type" />
          <button onClick={() => void refresh(1)} style={{ ...searchButtonStyle, padding: '10px 20px', fontSize: 13, fontWeight: 500 }} disabled={loading}>
            {loading ? 'Searching...' : 'Apply Filters'}
          </button>
        </div>
      </article>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Audit trail</h3>
        {logs.length ? (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Time</th>
                  <th style={tableHeaderCellStyle}>Action</th>
                  <th style={tableHeaderCellStyle}>Resource</th>
                  <th style={tableHeaderCellStyle}>Record</th>
                  <th style={tableHeaderCellStyle}>Actor</th>
                  <th style={tableHeaderCellStyle}>After</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={tableCellStyle}>{new Date(log.created_at).toLocaleString()}</td>
                    <td style={tableCellStyle}>{humanizeAuditCode(log.action_code)}</td>
                    <td style={tableCellStyle}>{humanizeAuditCode(log.resource_type)}</td>
                    <td style={tableCellStyle}>{log.resource_id || '—'}</td>
                    <td style={tableCellStyle}>{log.actor_type}{log.actor_user_id ? ` · ${log.actor_user_id}` : ''}</td>
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

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
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
    <div style={{ display: 'grid', gap: 6, minWidth: 260 }}>
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
