'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
    searchButtonStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tableActionButtonStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../merchflow-theme';
import { searchRowStyle, useCompactLayout } from '../workspace-responsive';
import { SearchableSelect } from '@/components/searchable-select';

type Supplier = {
  id: string;
  company_name: string;
  contact_name?: string | null;
  supplier_type?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  opening_payable_amount?: string | number;
  current_payable_amount?: string | number;
  purchase_count?: number;
  status: string;
};

type LedgerSupplier = {
  companyName: string;
  phone?: string | null;
  address?: string | null;
};

type LedgerTransaction = {
  tx_date: string;
  tx_ref: string;
  invoice_no?: string | null;
  tx_type: string;
  debit: number;
  credit: number;
  runningBalance: number;
};

type LedgerData = {
  supplier: LedgerSupplier;
  openingBalance: number;
  closingBalance: number;
  transactions: LedgerTransaction[];
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
};

const formatMoney = (v: string | number | null | undefined) => Number(Number(v ?? 0).toFixed(2)).toLocaleString('en-IN', { minimumFractionDigits: 2 });

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function SuppliersPanel() {
  const compact = useCompactLayout();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Supplier directory ready.');
  const [view, setView] = useState<'directory' | 'create' | 'edit' | 'ledger'>('directory');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Create/Edit form state
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    supplierType: 'supplier',
    phone: '',
    email: '',
    address: '',
    openingPayableAmount: '',
    note: '',
  });

  // Ledger state
  const [ledgerSupplierId, setLedgerSupplierId] = useState('');
  const [ledgerFromDate, setLedgerFromDate] = useState('');
  const [ledgerToDate, setLedgerToDate] = useState(new Date().toISOString().slice(0, 10));
  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20))), [pagination]);
  const supplierOpts = useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.company_name, indent: false })), [suppliers]);

  const refresh = async (search = query, nextPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(pagination.limit),
      });
      if (search.trim()) params.set('search', search.trim());

      const payload = await readJson<{ suppliers: Supplier[]; pagination?: Pagination }>(
        `/api/store-ops/suppliers?${params.toString()}`,
      );
      setSuppliers(payload.suppliers ?? []);
      setPagination(payload.pagination ?? { page: nextPage, limit: pagination.limit, total: payload.suppliers?.length ?? 0 });
      setPage(payload.pagination?.page ?? nextPage);
      setMessage(`Found ${payload.suppliers?.length ?? 0} supplier(s).`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const resetForm = () => {
    setForm({ companyName: '', contactName: '', supplierType: 'supplier', phone: '', email: '', address: '', openingPayableAmount: '', note: '' });
    setEditingSupplier(null);
  };

  const startCreate = () => {
    resetForm();
    setView('create');
  };

  const startEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setForm({
      companyName: supplier.company_name || '',
      contactName: supplier.contact_name || '',
      supplierType: supplier.supplier_type || 'supplier',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      openingPayableAmount: '',
      note: '',
    });
    setView('edit');
  };

  const saveSupplier = async () => {
    if (!form.companyName.trim()) {
      setMessage('Company name is required.');
      return;
    }
    setLoading(true);
    try {
      const body = {
        supplierType: form.supplierType,
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        openingPayableAmount: Number(form.openingPayableAmount || 0),
        note: form.note.trim() || undefined,
      };

      if (editingSupplier) {
        await readJson(`/api/store-ops/suppliers/${editingSupplier.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setMessage(`✓ Supplier "${form.companyName}" updated.`);
      } else {
        await readJson('/api/store-ops/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setMessage(`✓ Supplier "${form.companyName}" created.`);
      }

      resetForm();
      setView('directory');
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Ledger
  const openLedger = (supplierId: string) => {
    setLedgerSupplierId(supplierId);
    setLedgerData(null);
    setView('ledger');
  };

  const fetchLedger = async () => {
    if (!ledgerSupplierId) {
      setMessage('Select a supplier for the ledger.');
      return;
    }
    setLedgerLoading(true);
    try {
      const payload = await readJson<LedgerData>(
        `/api/store-ops/payables/supplier-ledger?supplierId=${ledgerSupplierId}&fromDate=${ledgerFromDate || ''}&toDate=${ledgerToDate || ''}`,
      );
      setLedgerData(payload);
      setMessage(`Ledger for ${payload.supplier.companyName}.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'ledger' && ledgerSupplierId && !ledgerData) {
      void fetchLedger();
    }
  }, [view, ledgerSupplierId]);

  const exportLedgerCsv = () => {
    if (!ledgerData) return;
    const rows: string[] = ['Date,Reference,Invoice No,Type,Debit (BDT),Credit (BDT),Balance (BDT)'];
    for (const tx of ledgerData.transactions) {
      rows.push(`${tx.tx_date},"${tx.tx_ref || ''}","${tx.invoice_no || ''}",${tx.tx_type},${tx.debit.toFixed(2)},${tx.credit.toFixed(2)},${tx.runningBalance.toFixed(2)}`);
    }
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-ledger-${ledgerData.supplier.companyName.replace(/\s+/g, '_')}-${ledgerFromDate || 'all'}-${ledgerToDate || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportLedgerPdf = () => {
    if (!ledgerData) return;
    const supplier = ledgerData.supplier;
    const rows = ledgerData.transactions.map((tx: LedgerTransaction) =>
      `<tr>
        <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-size:10px">${tx.tx_date}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-size:10px">${tx.tx_ref || ''}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-size:10px">${tx.invoice_no || ''}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:capitalize">${tx.tx_type}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-size:10px;text-align:right;font-family:monospace">${tx.debit.toFixed(2)}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-size:10px;text-align:right;font-family:monospace">${tx.credit.toFixed(2)}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-size:10px;text-align:right;font-family:monospace;font-weight:600">${tx.runningBalance.toFixed(2)}</td>
      </tr>`
    ).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Supplier Ledger</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:"Segoe UI",system-ui,sans-serif;background:#fff;color:#1e293b;font-size:12px}
      .page{width:210mm;margin:0 auto;padding:10mm 8mm}
      h2{font-size:18px;margin-bottom:4px}
      .meta{color:#475569;font-size:11px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse}
      th{background:#f1f5f9;color:#475569;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:.06em;padding:6px;border-bottom:2px solid #e2e8f0;text-align:left}
      th.right{text-align:right}
      .bl{font-weight:700;border-top:2px solid #1e293b}
      .bl td{padding-top:6px}
      .ob{border-top:1px solid #1e293b}
      .ob td{padding-top:6px}
      @media print{@page{margin:0;size:A4}}
    </style></head><body><div class="page">
      <h2>Supplier Ledger</h2>
      <div class="meta">
        <strong>${supplier.companyName}</strong>${supplier.phone ? ' | ' + supplier.phone : ''}${supplier.address ? ' | ' + supplier.address : ''}<br>
        Period: ${ledgerFromDate || 'Beginning'} to ${ledgerToDate || 'Present'}
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th>Reference</th><th>Invoice</th><th>Type</th><th class="right">Debit</th><th class="right">Credit</th><th class="right">Balance</th>
        </tr></thead>
        <tbody>
          <tr class="ob"><td colspan="4" style="font-weight:600">Opening Balance</td><td class="right" style="font-family:monospace;font-weight:600">${ledgerData.openingBalance.toFixed(2)}</td><td></td><td></td></tr>
          ${rows}
          <tr class="bl"><td colspan="4" style="font-weight:600">Closing Balance</td><td></td><td></td><td class="right" style="font-family:monospace;font-weight:700">${ledgerData.closingBalance.toFixed(2)}</td></tr>
        </tbody>
      </table>
    </div></body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1200);
    };
  };

  // Find supplier name for ledger header
  const ledgerSupplierName = useMemo(() => {
    if (ledgerData) return ledgerData.supplier.companyName;
    const found = suppliers.find((s) => s.id === ledgerSupplierId);
    return found?.company_name || 'Supplier';
  }, [ledgerData, ledgerSupplierId, suppliers]);

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      {/* Tabs & actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {view === 'directory' ? (
            <button onClick={startCreate} style={gray800ButtonStyle}>+ New Supplier</button>
          ) : (
            <button onClick={() => { resetForm(); setView('directory'); }} style={secondaryButtonStyle}>← Back</button>
          )}
        </div>
      </div>

      {/* ═══════════ Supplier Directory Tab ═══════════ */}
      {view === 'directory' ? (
        <section style={{ display: 'grid', gap: 16 }}>
          {/* Search */}
          <div style={{ ...searchRowStyle }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void refresh(query, 1); }}
              style={{ ...fieldStyle, flex: 1 }}
              placeholder="Search by company name, phone, or email"
            />
            <button onClick={() => void refresh(query, 1)} style={searchButtonStyle} disabled={loading}>Search</button>
          </div>

          {/* Supplier list */}
          <article style={surfaceCardStyle}>
            {suppliers.length ? (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Company</th>
                      <th style={tableHeaderCellStyle}>Contact</th>
                      <th style={tableHeaderCellStyle}>Phone</th>
                      <th style={tableHeaderCellStyle}>Payable</th>
                      <th style={tableHeaderCellStyle}>Purchases</th>
                      <th style={tableHeaderCellStyle}>Status</th>
                      <th style={tableHeaderCellStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((supplier) => (
                      <tr key={supplier.id}>
                        <td style={{ ...tableCellStyle, fontWeight: 500 }}>{supplier.company_name}</td>
                        <td style={tableCellStyle}>{supplier.contact_name || '—'}</td>
                        <td style={tableCellStyle}>{supplier.phone || '—'}</td>
                        <td style={{ ...tableCellStyle, color: supplier.current_payable_amount && Number(supplier.current_payable_amount) > 0 ? '#92400e' : undefined }}>
                          {supplier.current_payable_amount ? `BDT ${formatMoney(supplier.current_payable_amount)}` : '—'}
                        </td>
                        <td style={tableCellStyle}>{supplier.purchase_count ?? 0}</td>
                        <td style={tableCellStyle}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            background: supplier.status === 'active' ? '#dcfce7' : '#f1f5f9',
                            color: supplier.status === 'active' ? '#166534' : '#64748b',
                          }}>
                            {supplier.status || 'active'}
                          </span>
                        </td>
                        <td style={{ ...tableCellStyle, display: 'flex', gap: 6 }}>
                          <button onClick={() => startEdit(supplier)} style={tableActionButtonStyle}>Edit</button>
                          <button onClick={() => openLedger(supplier.id)} style={tableActionButtonStyle}>Ledger</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={emptyStateStyle}>
                {query.trim() ? 'No suppliers matched this search.' : 'No suppliers yet. Create your first supplier to get started.'}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12 }}>
              <span style={tokenMutedStyle}>Page {page} of {totalPages} · {pagination.total} supplier(s)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => void refresh(query, Math.max(1, page - 1))} style={secondaryButtonStyle} disabled={loading || page <= 1}>Previous</button>
                <button onClick={() => void refresh(query, Math.min(totalPages, page + 1))} style={secondaryButtonStyle} disabled={loading || page >= totalPages}>Next</button>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {/* ═══════════ Create / Edit Form ═══════════ */}
      {view === 'create' || view === 'edit' ? (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>{editingSupplier ? `Edit Supplier: ${editingSupplier.company_name}` : 'Create New Supplier'}</h3>

          <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
            <input
              value={form.companyName}
              onChange={(e) => setForm((c) => ({ ...c, companyName: e.target.value }))}
              style={fieldStyle}
              placeholder="Company name *"
            />

            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 10 }}>
              <select
                value={form.supplierType}
                onChange={(e) => setForm((c) => ({ ...c, supplierType: e.target.value }))}
                style={fieldStyle}
              >
                <option value="supplier">Supplier</option>
                <option value="importer">Importer</option>
                <option value="company">Company</option>
              </select>
              <input
                value={form.contactName}
                onChange={(e) => setForm((c) => ({ ...c, contactName: e.target.value }))}
                style={fieldStyle}
                placeholder="Contact person (optional)"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 10 }}>
              <input
                value={form.phone}
                onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                style={fieldStyle}
                placeholder="Phone (optional)"
              />
              <input
                value={form.email}
                onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                style={fieldStyle}
                placeholder="Email (optional)"
              />
            </div>

            <textarea
              value={form.address}
              onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))}
              style={{ ...fieldStyle, minHeight: 60 }}
              placeholder="Address (optional)"
            />

            {!editingSupplier ? (
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.openingPayableAmount}
                onChange={(e) => setForm((c) => ({ ...c, openingPayableAmount: e.target.value }))}
                style={fieldStyle}
                placeholder="Opening payable amount (BDT, optional)"
              />
            ) : null}

            <textarea
              value={form.note}
              onChange={(e) => setForm((c) => ({ ...c, note: e.target.value }))}
              style={{ ...fieldStyle, minHeight: 60 }}
              placeholder="Note (optional)"
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveSupplier} style={{ ...gray800ButtonStyle, flex: 1 }} disabled={loading || !form.companyName.trim()}>
                {loading ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Create Supplier'}
              </button>
              <button onClick={() => { resetForm(); setView('directory'); }} style={secondaryButtonStyle} disabled={loading}>Cancel</button>
            </div>
          </div>
        </article>
      ) : null}

      {/* ═══════════ Supplier Ledger Tab ═══════════ */}
      {view === 'ledger' ? (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Supplier Ledger: {ledgerSupplierName}</h3>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <SearchableSelect
              options={supplierOpts}
              value={ledgerSupplierId}
              onChange={(v) => {
                setLedgerSupplierId(v);
                setLedgerData(null);
              }}
              placeholder="Select supplier"
              emptyMessage="No suppliers found"
              style={{ minWidth: 220 }}
            />
            <input
              type="date"
              value={ledgerFromDate}
              onChange={(e) => setLedgerFromDate(e.target.value)}
              style={{ ...fieldStyle, maxWidth: 160 }}
              placeholder="From date"
            />
            <input
              type="date"
              value={ledgerToDate}
              onChange={(e) => setLedgerToDate(e.target.value)}
              style={{ ...fieldStyle, maxWidth: 160 }}
              placeholder="To date"
            />
            <button onClick={fetchLedger} style={searchButtonStyle} disabled={ledgerLoading || !ledgerSupplierId}>
              {ledgerLoading ? 'Loading...' : 'Load Ledger'}
            </button>
          </div>

          {ledgerData ? (
            <div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                  Opening: <strong style={{ color: '#1e293b' }}>BDT {formatMoney(ledgerData.openingBalance)}</strong>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                  Closing: <strong style={{ color: '#1e293b' }}>BDT {formatMoney(ledgerData.closingBalance)}</strong>
                </div>
              </div>

              {ledgerData.transactions.length ? (
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCellStyle}>Date</th>
                        <th style={tableHeaderCellStyle}>Reference</th>
                        <th style={tableHeaderCellStyle}>Invoice</th>
                        <th style={tableHeaderCellStyle}>Type</th>
                        <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Debit</th>
                        <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Credit</th>
                        <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={4} style={{ ...tableCellStyle, fontWeight: 600 }}>Opening Balance</td>
                        <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                          {formatMoney(ledgerData.openingBalance)}
                        </td>
                        <td style={tableCellStyle}></td>
                        <td style={tableCellStyle}></td>
                      </tr>
                      {ledgerData.transactions.map((tx, i) => (
                        <tr key={i}>
                          <td style={tableCellStyle}>{tx.tx_date}</td>
                          <td style={tableCellStyle}>{tx.tx_ref || ''}</td>
                          <td style={tableCellStyle}>{tx.invoice_no || ''}</td>
                          <td style={{ ...tableCellStyle, textTransform: 'capitalize' }}>{tx.tx_type}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{tx.debit.toFixed(2)}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{tx.credit.toFixed(2)}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{tx.runningBalance.toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid #1e293b' }}>
                        <td colSpan={4} style={{ ...tableCellStyle, fontWeight: 700 }}>Closing Balance</td>
                        <td style={tableCellStyle}></td>
                        <td style={tableCellStyle}></td>
                        <td style={{ ...tableCellStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                          {formatMoney(ledgerData.closingBalance)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={emptyStateStyle}>No transactions in this period.</div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={exportLedgerCsv} style={secondaryButtonStyle}>Export CSV</button>
                <button onClick={exportLedgerPdf} style={secondaryButtonStyle}>Export PDF</button>
              </div>
            </div>
          ) : (
            <div style={emptyStateStyle}>
              {ledgerLoading ? 'Loading ledger data...' : 'Select date range and click "Load Ledger" to view supplier transactions.'}
            </div>
          )}
        </article>
      ) : null}

    </section>
  );
}
