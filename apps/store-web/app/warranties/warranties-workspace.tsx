'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
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
import { ListPager } from '../list-pager';
import { WorkspaceTabs, searchRowStyle } from '../workspace-responsive';

type Policy = {
  id: string;
  code: string;
  name: string;
  warrantyType: string;
  durationMonths: number;
  coverageScope: string;
  isDefaultPolicy: boolean;
};

type EligibleSerial = {
  device_serial_id: string;
  serial_number: string;
  imei_number?: string | null;
  device_model?: string | null;
  color?: string | null;
  sale_id: string;
  sale_no: string;
  invoice_no?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  sold_at: string;
  sale_item_id: string;
  product_name_snapshot?: string | null;
  sku_code_snapshot?: string | null;
  unit_price?: string | number | null;
};

type WarrantyRow = {
  id: string;
  warranty_reference_number: string;
  warranty_start_date: string;
  warranty_end_date: string;
  warranty_purchased_price?: string | number | null;
  status: string;
  policy_name: string;
  policy_duration_months: number;
  serial_number: string;
  imei_number?: string | null;
  device_model?: string | null;
  sale_no: string;
  invoice_no?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  sold_at: string;
  product_name_snapshot?: string | null;
  sku_code_snapshot?: string | null;
  created_at: string;
};

const statusColors: Record<string, string> = {
  active: '#16a34a',
  claimed: '#d97706',
  expired: '#64748b',
  voided: '#dc2626',
  transferred: '#2563eb',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-BD', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function WarrantiesWorkspace() {
  const [activeTab, setActiveTab] = useState<'register' | 'history'>('register');

  // Register tab state
  const [eligibleQuery, setEligibleQuery] = useState('');
  const [eligibleSerials, setEligibleSerials] = useState<EligibleSerial[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleSearched, setEligibleSearched] = useState(false);
  const [selected, setSelected] = useState<EligibleSerial | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policyId, setPolicyId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [purchasedPrice, setPurchasedPrice] = useState('');
  const [registering, setRegistering] = useState(false);

  // History tab state
  const [historyQuery, setHistoryQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [warranties, setWarranties] = useState<WarrantyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/warranty/policies');
        const data = await res.json();
        if (res.ok) {
          setPolicies(data.policies || []);
          const preferred = data.policies?.find((p: Policy) => p.isDefaultPolicy) || data.policies?.[0];
          if (preferred) setPolicyId((current) => current || preferred.id);
        }
      } catch {
        // best-effort; register form still usable once policies load
      }
    })();
  }, []);

  const searchEligible = useCallback(async () => {
    const q = eligibleQuery.trim();
    if (!q) {
      toast.error('Enter a serial number, IMEI, customer, phone, or sale number to search');
      return;
    }
    setEligibleLoading(true);
    try {
      const res = await fetch(`/api/warranty/eligible-serials?q=${encodeURIComponent(q)}&limit=20`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || data?.message || 'Search failed');
        return;
      }
      setEligibleSerials(data.serials || []);
      setEligibleSearched(true);
    } finally {
      setEligibleLoading(false);
    }
  }, [eligibleQuery]);

  const loadHistory = useCallback(async (nextPage: number) => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String((nextPage - 1) * limit) });
      if (historyQuery.trim()) params.set('q', historyQuery.trim());
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/warranty/sale-warranties?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || data?.message || 'Failed to load warranties');
        return;
      }
      setWarranties(data.warranties || []);
      setTotal(data.total || 0);
      setPage(nextPage);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyQuery, statusFilter]);

  useEffect(() => {
    void loadHistory(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registerWarranty = useCallback(async () => {
    if (!selected) {
      toast.error('Select a sold device first');
      return;
    }
    if (!policyId) {
      toast.error('Select a warranty policy');
      return;
    }
    if (!startDate) {
      toast.error('Pick a warranty start date');
      return;
    }
    setRegistering(true);
    try {
      const res = await fetch('/api/warranty/sale-warranties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: selected.sale_id,
          saleItemId: selected.sale_item_id,
          deviceSerialId: selected.device_serial_id,
          warrantyPolicyId: policyId,
          warrantyStartDate: startDate,
          warrantyPurchasedPrice: purchasedPrice ? Number(purchasedPrice) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || 'Failed to register warranty');
        return;
      }
      toast.success(`Warranty ${data.warrantyReferenceNumber || ''} registered`.trim());
      setSelected(null);
      setEligibleSerials([]);
      setEligibleQuery('');
      setPurchasedPrice('');
      void loadHistory(1);
      setActiveTab('history');
    } finally {
      setRegistering(false);
    }
  }, [selected, policyId, startDate, purchasedPrice, loadHistory]);

  return (
    <div style={pageShellStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Warranties</h1>
          <p style={{ ...tokenMutedStyle, marginTop: 2 }}>
            Register sold devices under warranty policies and track coverage by serial or IMEI.
          </p>
        </div>
      </div>

      <WorkspaceTabs
        active={activeTab}
        onChange={(key) => setActiveTab(key as 'register' | 'history')}
        tabs={[
          { key: 'register', label: 'Register Warranty' },
          { key: 'history', label: 'Warranty History' },
        ]}
      />

      {activeTab === 'register' ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <section style={surfaceCardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Find a sold device</div>
            <div style={{ ...searchRowStyle, marginBottom: 12 }}>
              <input
                style={{ ...fieldStyle, flex: 1, minWidth: 240 }}
                placeholder="Search by serial number, IMEI, customer name, phone, or sale number"
                value={eligibleQuery}
                onChange={(e) => setEligibleQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void searchEligible(); }}
              />
              <button onClick={() => void searchEligible()} style={searchButtonStyle} disabled={eligibleLoading}>
                {eligibleLoading ? 'Searching…' : 'Search'}
              </button>
            </div>

            {eligibleSerials.length === 0 ? (
              eligibleSearched ? (
                <div style={emptyStateStyle}>No eligible devices found. Devices already under an active warranty are excluded.</div>
              ) : (
                <div style={emptyStateStyle}>Search a serial or IMEI to find devices sold without an active warranty.</div>
              )
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Device</th>
                      <th style={tableHeaderCellStyle}>Serial / IMEI</th>
                      <th style={tableHeaderCellStyle}>Sold To</th>
                      <th style={tableHeaderCellStyle}>Sale</th>
                      <th style={tableHeaderCellStyle}>Sold On</th>
                      <th style={tableHeaderCellStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleSerials.map((s) => {
                      const isSelected = selected?.device_serial_id === s.device_serial_id;
                      return (
                        <tr key={s.device_serial_id} style={isSelected ? { background: 'var(--accent)' } : undefined}>
                          <td style={tableCellStyle}>
                            <div style={{ fontWeight: 600 }}>{s.product_name_snapshot || s.device_model || 'Device'}</div>
                            {s.sku_code_snapshot && <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{s.sku_code_snapshot}</div>}
                          </td>
                          <td style={tableCellStyle}>
                            <div style={{ fontFamily: 'monospace' }}>{s.serial_number}</div>
                            {s.imei_number && <div style={{ ...tokenMutedStyle, fontSize: 11, fontFamily: 'monospace' }}>IMEI {s.imei_number}</div>}
                          </td>
                          <td style={tableCellStyle}>
                            <div>{s.customer_name || 'Walk-in'}</div>
                            {s.customer_phone && <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{s.customer_phone}</div>}
                          </td>
                          <td style={tableCellStyle}>
                            <div>{s.sale_no}</div>
                            {s.invoice_no && <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{s.invoice_no}</div>}
                          </td>
                          <td style={tableCellStyle}>{formatDate(s.sold_at)}</td>
                          <td style={tableCellStyle}>
                            <button
                              style={isSelected ? gray800ButtonStyle : secondaryButtonStyle}
                              onClick={() => setSelected(isSelected ? null : s)}
                            >
                              {isSelected ? 'Selected ✓' : 'Select'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={surfaceCardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Warranty details</div>
            {!selected ? (
              <div style={emptyStateStyle}>Select a sold device above to register a warranty.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ ...tokenMutedStyle, fontSize: 12 }}>
                  {selected.product_name_snapshot || selected.device_model || 'Device'} · SN {selected.serial_number}
                  {selected.imei_number ? ` · IMEI ${selected.imei_number}` : ''} · sold on {formatDate(selected.sold_at)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 500 }}>
                    Policy
                    <select style={fieldStyle} value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
                      <option value="">Select policy…</option>
                      {policies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.durationMonths} mo{p.isDefaultPolicy ? ' · default' : ''})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 500 }}>
                    Start date
                    <input type="date" style={fieldStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 500 }}>
                    Purchased price (optional)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      style={fieldStyle}
                      placeholder="0.00"
                      value={purchasedPrice}
                      onChange={(e) => setPurchasedPrice(e.target.value)}
                    />
                  </label>
                </div>
                <div>
                  <button onClick={() => void registerWarranty()} style={searchButtonStyle} disabled={registering}>
                    {registering ? 'Registering…' : 'Register Warranty'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        <section style={surfaceCardStyle}>
          <div style={{ ...searchRowStyle, marginBottom: 12 }}>
            <input
              style={{ ...fieldStyle, flex: 1, minWidth: 240 }}
              placeholder="Search by serial, IMEI, customer, phone, sale no, invoice, or warranty ref"
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void loadHistory(1); }}
            />
            <select style={{ ...fieldStyle, width: 150 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="claimed">Claimed</option>
              <option value="expired">Expired</option>
              <option value="voided">Voided</option>
              <option value="transferred">Transferred</option>
            </select>
            <button onClick={() => void loadHistory(1)} style={searchButtonStyle} disabled={historyLoading}>
              {historyLoading ? 'Loading…' : 'Search'}
            </button>
          </div>

          {warranties.length === 0 ? (
            <div style={emptyStateStyle}>No warranties found.</div>
          ) : (
            <>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Reference</th>
                      <th style={tableHeaderCellStyle}>Device</th>
                      <th style={tableHeaderCellStyle}>Serial / IMEI</th>
                      <th style={tableHeaderCellStyle}>Customer</th>
                      <th style={tableHeaderCellStyle}>Policy</th>
                      <th style={tableHeaderCellStyle}>Coverage</th>
                      <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Price</th>
                      <th style={tableHeaderCellStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warranties.map((w) => (
                      <tr key={w.id}>
                        <td style={tableCellStyle}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{w.warranty_reference_number}</div>
                          <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{w.sale_no}{w.invoice_no ? ` · ${w.invoice_no}` : ''}</div>
                        </td>
                        <td style={tableCellStyle}>
                          <div style={{ fontWeight: 600 }}>{w.product_name_snapshot || w.device_model || 'Device'}</div>
                          {w.sku_code_snapshot && <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{w.sku_code_snapshot}</div>}
                        </td>
                        <td style={tableCellStyle}>
                          <div style={{ fontFamily: 'monospace' }}>{w.serial_number}</div>
                          {w.imei_number && <div style={{ ...tokenMutedStyle, fontSize: 11, fontFamily: 'monospace' }}>IMEI {w.imei_number}</div>}
                        </td>
                        <td style={tableCellStyle}>
                          <div>{w.customer_name || 'Walk-in'}</div>
                          {w.customer_phone && <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{w.customer_phone}</div>}
                        </td>
                        <td style={tableCellStyle}>
                          <div>{w.policy_name}</div>
                          <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{w.policy_duration_months} months</div>
                        </td>
                        <td style={tableCellStyle}>
                          {formatDate(w.warranty_start_date)} → {formatDate(w.warranty_end_date)}
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                          {w.warranty_purchased_price != null ? Number(w.warranty_purchased_price).toFixed(2) : '—'}
                        </td>
                        <td style={tableCellStyle}>
                          <span style={{ fontWeight: 600, color: statusColors[w.status] || '#64748b', textTransform: 'capitalize' }}>{w.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPager
                page={page}
                pagination={{ page, total, limit }}
                onPrevious={() => void loadHistory(page - 1)}
                onNext={() => void loadHistory(page + 1)}
                label="warranties"
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
