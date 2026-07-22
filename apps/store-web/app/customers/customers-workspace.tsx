'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Phone, MessageSquareText } from 'lucide-react';

import {
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
  pageShellStyle,
  searchButtonStyle,
  secondaryButtonStyle,
  subtleButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../marketone-theme';
import { searchRowStyle, useCompactLayout } from '../workspace-responsive';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';

type Customer = {
  id: string;
  full_name?: string | null;
  mobile_no?: string | null;
  email?: string | null;
  shop_name?: string | null;
  address?: string | null;
  last_purchase_date?: string | null;
  total_sales_count?: number;
  total_purchase_amount?: number | string;
  points?: number;
  level?: string;
};

type LevelConfig = {
  pointsPerAmount: number;
  silverThreshold: number;
  goldThreshold: number;
  platinumThreshold: number;
};

const DEFAULT_LEVELS: LevelConfig = {
  pointsPerAmount: 100,
  silverThreshold: 0,
  goldThreshold: 500,
  platinumThreshold: 2000,
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  }
  return payload as T;
}

function calcPoints(amount: number, per: number): number {
  return Math.floor(amount / per);
}

function calcLevel(points: number, config: LevelConfig): string {
  if (points >= config.platinumThreshold) return 'Platinum';
  if (points >= config.goldThreshold) return 'Gold';
  if (points >= config.silverThreshold) return 'Silver';
  return 'Bronze';
}

const levelBadgeStyle = (level: string): React.CSSProperties => {
  const map: Record<string, { bg: string; fg: string }> = {
    Platinum: { bg: '#e8d5f5', fg: '#6b21a8' },
    Gold: { bg: '#fef3c7', fg: '#92400e' },
    Silver: { bg: '#f1f5f9', fg: '#475569' },
    Bronze: { bg: '#ffedd5', fg: '#9a3412' },
  };
  const s = map[level] ?? map.Bronze;
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 600,
    background: s.bg,
    color: s.fg,
  };
};

export function CustomersWorkspace() {
  const compact = useCompactLayout();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Customer directory is ready.');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0 });
  const [levelConfig, setLevelConfig] = useState<LevelConfig>(DEFAULT_LEVELS);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  // Load level config from store settings
  useEffect(() => {
    readJson<{ settings: Record<string, any> }>('/api/store/settings')
      .then((payload) => {
        const s = payload.settings ?? {};
        setLevelConfig({
          pointsPerAmount: Number(s.points_per_amount) || DEFAULT_LEVELS.pointsPerAmount,
          silverThreshold: Number(s.silver_threshold) || DEFAULT_LEVELS.silverThreshold,
          goldThreshold: Number(s.gold_threshold) || DEFAULT_LEVELS.goldThreshold,
          platinumThreshold: Number(s.platinum_threshold) || DEFAULT_LEVELS.platinumThreshold,
        });
      })
      .catch(() => { /* use defaults */ });
  }, []);

  const refresh = async (search = query, nextPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(pagination.limit) });
      if (search.trim()) params.set('query', search.trim());
      const payload = await readJson<{ customers: Customer[]; pagination?: PaginationState }>(`/api/store-ops/customers?${params.toString()}`);
      setCustomers(payload.customers ?? []);
      setPagination(payload.pagination ?? { page: nextPage, limit: pagination.limit, total: payload.customers?.length ?? 0 });
      setPage(payload.pagination?.page ?? nextPage);
      setMessage(`${payload.customers?.length ?? 0} customer(s) loaded.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  // Reactive search: debounce query changes
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void refresh(query).catch((error: Error) => setMessage(error.message));
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  const enrichedCustomers = useMemo(() =>
    customers.map((c) => {
      const amount = Number(c.total_purchase_amount ?? 0);
      const points = c.points ?? calcPoints(amount, levelConfig.pointsPerAmount);
      const level = c.level ?? calcLevel(points, levelConfig);
      return { ...c, points, level };
    }),
  [customers, levelConfig]);

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      {/* Search row */}
      <div style={{ ...searchRowStyle }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void refresh(query, 1); }}
          style={{ ...fieldStyle, flex: 1 }}
          placeholder="Search name, mobile, email, or shop..."
        />
        <button onClick={() => void refresh(query, 1)} style={searchButtonStyle} disabled={loading}>Search</button>
      </div>

      {/* Customer table */}
      {enrichedCustomers.length ? (
        <article style={surfaceCardStyle}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Name</th>
                  <th style={tableHeaderCellStyle}>Mobile</th>
                  <th style={tableHeaderCellStyle}>Email</th>
                  <th style={tableHeaderCellStyle}>Last Purchase</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Purchases</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Total Amount</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Points</th>
                  <th style={tableHeaderCellStyle}>Level</th>
                  <th style={tableHeaderCellStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrichedCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td style={{ ...tableCellStyle, fontWeight: 500 }}>{customer.full_name || customer.shop_name || customer.mobile_no || 'Unnamed'}</td>
                    <td style={tableCellStyle}>{customer.mobile_no || '—'}</td>
                    <td style={tableCellStyle}>{customer.email || '—'}</td>
                    <td style={tableCellStyle}>{customer.last_purchase_date ? new Date(customer.last_purchase_date).toLocaleDateString('en-BD') : '—'}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>{customer.total_sales_count ?? 0}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{Number(customer.total_purchase_amount ?? 0).toFixed(2)}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{customer.points}</td>
                    <td style={tableCellStyle}><span style={levelBadgeStyle(customer.level!)}>{customer.level}</span></td>
                    <td style={tableCellStyle}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => setDetailCustomer(customer)}
                          style={{ ...subtleButtonStyle, padding: '4px 6px', lineHeight: 1 }}
                          title="View details"
                        >
                          <Eye size={14} />
                        </button>
                        {customer.mobile_no ? (
                          <>
                            <a
                              href={`tel:${customer.mobile_no}`}
                              style={{ ...subtleButtonStyle, padding: '4px 6px', lineHeight: 1, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
                              title="Call"
                            >
                              <Phone size={14} />
                            </a>
                            <a
                              href={`sms:${customer.mobile_no}`}
                              style={{ ...subtleButtonStyle, padding: '4px 6px', lineHeight: 1, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
                              title="Send SMS"
                            >
                              <MessageSquareText size={14} />
                            </a>
                          </>
                        ) : (
                          <span style={{ ...tokenMutedStyle, fontSize: 10, padding: '0 4px' }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8 }}>
            <ListPager
              loading={loading}
              page={page}
              pagination={pagination}
              label="customer(s)"
              onPrevious={() => void refresh(query, Math.max(1, page - 1))}
              onNext={() => void refresh(query, Math.min(totalPagesFor(pagination), page + 1))}
            />
          </div>
        </article>
      ) : (
        <article style={surfaceCardStyle}>
          <div style={emptyStateStyle}>{query ? 'No customers match this search.' : 'No customers yet.'}</div>
        </article>
      )}

      {/* Customer Detail Modal */}
      {detailCustomer ? (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setDetailCustomer(null)}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24, maxWidth: 520, width: '95%',
            maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Customer Details</h3>
              <button onClick={() => setDetailCustomer(null)} style={{ ...secondaryButtonStyle, minWidth: 40, fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</label>
                <div style={{ fontWeight: 600 }}>{detailCustomer.full_name || '—'}</div>
              </div>
              {detailCustomer.shop_name ? (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shop / Business</label>
                  <div>{detailCustomer.shop_name}</div>
                </div>
              ) : null}
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mobile</label>
                <div>{detailCustomer.mobile_no || '—'}</div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
                <div>{detailCustomer.email || '—'}</div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Address</label>
                <div>{detailCustomer.address || '—'}</div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Purchases</label>
                    <div style={{ fontWeight: 600 }}>{detailCustomer.total_sales_count ?? 0}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Amount</label>
                    <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>BDT {Number(detailCustomer.total_purchase_amount ?? 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Points</label>
                    <div style={{ fontWeight: 600 }}>{detailCustomer.points ?? 0}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Level</label>
                    <div><span style={levelBadgeStyle(detailCustomer.level ?? 'Bronze')}>{detailCustomer.level ?? 'Bronze'}</span></div>
                  </div>
                </div>
              </div>
              {detailCustomer.last_purchase_date ? (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Purchase</label>
                  <div>{new Date(detailCustomer.last_purchase_date).toLocaleDateString('en-BD', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
              ) : null}
              {detailCustomer.mobile_no ? (
                <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <a href={`tel:${detailCustomer.mobile_no}`} style={{ ...gray800ButtonStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={14} /> Call
                  </a>
                  <a href={`sms:${detailCustomer.mobile_no}`} style={{ ...secondaryButtonStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <MessageSquareText size={14} /> SMS
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
