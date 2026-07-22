'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  dangerButtonStyle,
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
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';
import { searchRowStyle, stackedFilterGridStyle, useCompactLayout, WorkspaceTabs } from '../workspace-responsive';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/searchable-select';

type Supplier = { id: string; company_name: string; contact_name?: string | null; phone?: string | null; opening_payable_amount?: string | number; current_payable_amount?: string | number };
type Location = { id: string; code: string; name: string; location_type: string };
type Purchase = { id: string; purchase_no: string; purchase_date: string; supplier_name: string; location_name: string; total_amount: string | number; paid_amount: string | number; payment_status: string; status: string; created_at: string };
type PayableRow = { id: string; purchase_no: string; supplier_name: string; supplier_phone?: string | null; invoice_no?: string | null; purchase_date: string; total_amount: string | number; outstanding_amount: string | number; aging_days: number };
type SkuResult = { id: string; sku_code: string; product_name: string; product_code?: string | null; variant_label?: string | null; barcode?: string | null; sale_price?: string | number | null; cost_price?: string | number | null; available_qty?: string | number | null };
type Aging = { today_amount?: string | number; today_count?: number; days_7_amount?: string | number; days_7_count?: number; days_30_amount?: string | number; days_30_count?: number; days_90_amount?: string | number; days_90_count?: number; days_90_plus_amount?: string | number; days_90_plus_count?: number };

const formatMoney = (v: string | number | null | undefined) => Number(Number(v ?? 0).toFixed(2)).toLocaleString('en-IN', { minimumFractionDigits: 2 });

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string; message?: string | string[] } | null;

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    if (payload && typeof payload === 'object') {
      const err = payload as { error?: string; message?: string | string[] };
      if (typeof err.message === 'string') {
        message = err.message;
      } else if (Array.isArray(err.message) && err.message.length > 0) {
        message = err.message[0];
      } else if (typeof err.error === 'string') {
        message = err.error;
      }
    }
    throw new Error(message);
  }

  return payload as T;
}

function MetricTile({ label, amount, count }: { label: string; amount?: string | number; count?: string | number }) {
  return (
    <article style={{ ...surfaceCardStyle, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>BDT {formatMoney(amount)}</div>
      <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{count ?? '—'} invoices</div>
    </article>
  );
}

export function PurchasesWorkspace() {
  const compact = useCompactLayout();
  const [activeTab, setActiveTab] = useState<'receive' | 'purchases' | 'payables'>('receive');
  const [message, setMessage] = useState('Purchases & stock management.');
  const [loading, setLoading] = useState(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [aging, setAging] = useState<Aging | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [skuResults, setSkuResults] = useState<SkuResult[]>([]);

  const [supplierPage, setSupplierPage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [payablePage, setPayablePage] = useState(1);
  const [purchasePagination, setPurchasePagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });
  const [payablePagination, setPayablePagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });
  const [payableSearch, setPayableSearch] = useState('');
  const [payableSortBy, setPayableSortBy] = useState('purchase_date');
  const [payableSortDir, setPayableSortDir] = useState('desc');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseStatus, setPurchaseStatus] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [showSkuSuggestions, setShowSkuSuggestions] = useState(false);
  const [skuSearching, setSkuSearching] = useState(false);
  const skuDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quick Add + Receive
  const [quickName, setQuickName] = useState('');
  const [quickSupplierId, setQuickSupplierId] = useState('');
  const [quickLocationId, setQuickLocationId] = useState('');
  const [quickPaid, setQuickPaid] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  // Category & Brand selection
  const [quickCategoryId, setQuickCategoryId] = useState('');
  const [quickBrandId, setQuickBrandId] = useState('');
  // Variants with individual pricing
  const [quickHasVariants, setQuickHasVariants] = useState(false);
  // Track inventory is always enabled
  const [quickVariantRows, setQuickVariantRows] = useState<Array<{ key: string; label: string; price: string; cost: string; qty: string }>>([]);
  const [quickVariantInput, setQuickVariantInput] = useState('');
  const [quickVariantPrice, setQuickVariantPrice] = useState('');
  const [quickVariantCost, setQuickVariantCost] = useState('');
  const [quickVariantQty, setQuickVariantQty] = useState('1');
  // Categories loaded from API
  const [categories, setCategories] = useState<Array<{ id: string; name: string; parent_id?: string | null; parent_name?: string | null }>>([]);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  // Build hierarchical category display
  const categoryTree = useMemo(() => {
    const map = new Map<string, { id: string; name: string; parent_id: string | null; children: Array<{ id: string; name: string }> }>();
    for (const c of categories) { map.set(c.id, { id: c.id, name: c.name, parent_id: c.parent_id ?? null, children: [] }); }
    for (const c of categories) {
      if (c.parent_id && map.has(c.parent_id)) { map.get(c.parent_id)!.children.push({ id: c.id, name: c.name }); }
    }
    return Array.from(map.values()).filter((c) => !c.parent_id);
  }, [categories]);

  // Regular purchase form
  const [purchaseForm, setPurchaseForm] = useState({ supplierId: '', locationId: '', purchaseDate: new Date().toISOString().slice(0, 10), invoiceNo: '', discountAmount: '0', taxAmount: '0', shippingAmount: '0', paidAmount: '0', paymentMethod: 'cash' as 'cash' | 'card' | 'mfs' | 'bank_transfer', paymentReference: '', note: '' });
  const [items, setItems] = useState<Array<{ skuId: string; label: string; qty: string; unitCost: string; batchNo: string; expiryDate: string }>>([]);
  const [lineDefaults, setLineDefaults] = useState({ qty: '1', unitCost: '' });

  const supplierOptions = useMemo(() => suppliers.map((s) => ({ id: s.id, company_name: s.company_name })), [suppliers]);
  const categoryOpts = useMemo(() => {
    const result: Array<{ value: string; label: string; indent: boolean }> = [];
    for (const parent of categoryTree) {
      result.push({ value: parent.id, label: parent.name, indent: false });
      for (const child of parent.children) {
        result.push({ value: child.id, label: child.name, indent: true });
      }
    }
    for (const c of categories) {
      if (!c.parent_id && !categoryTree.find((t) => t.id === c.id)) {
        result.push({ value: c.id, label: c.name, indent: false });
      }
    }
    return result;
  }, [categories, categoryTree]);
  const brandOpts = useMemo(() => brands.map((b) => ({ value: b.id, label: b.name, indent: false })), [brands]);
  const supplierOpts = useMemo(() => supplierOptions.map((s) => ({ value: s.id, label: s.company_name, indent: false })), [supplierOptions]);
  const locationOpts = useMemo(() => locations.map((l) => ({ value: l.id, label: `${l.name} · ${l.code}`, indent: false })), [locations]);

  const lineTotal = useMemo(() => {
    const discount = Number(purchaseForm.discountAmount || 0);
    const tax = Number(purchaseForm.taxAmount || 0);
    const shipping = Number(purchaseForm.shippingAmount || 0);
    const subtotal = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitCost || 0), 0);
    return { subtotal, total: subtotal + tax + shipping - discount, outstanding: Math.max(subtotal + tax + shipping - discount - Number(purchaseForm.paidAmount || 0), 0) };
  }, [items, purchaseForm.discountAmount, purchaseForm.taxAmount, purchaseForm.shippingAmount, purchaseForm.paidAmount]);

  // ── Data loading ──

  const refresh = async (sp = supplierPage, pp = purchasePage, ppage = payablePage) => {
    setLoading(true);
    try {
      const [supplierPayload, purchasePayload, payablePayload, agingPayload, locationPayload] = await Promise.all([
        readJson<{ suppliers: Supplier[] }>(`/api/store-ops/suppliers?limit=100`),
        readJson<{ purchases: Purchase[]; pagination?: PaginationState }>(`/api/store-ops/purchases?page=${pp}&limit=10&search=${encodeURIComponent(purchaseSearch)}&status=${purchaseStatus}`),
        readJson<{ payables: PayableRow[]; pagination?: PaginationState }>(`/api/store-ops/payables?page=${ppage}&limit=10&search=${encodeURIComponent(payableSearch)}&sortBy=${payableSortBy}&sortDir=${payableSortDir}`),
        readJson<{ aging: Aging }>('/api/store-ops/payables/aging'),
        readJson<{ locations: Location[] }>('/api/inventory/locations'),
      ]);
      setSuppliers(supplierPayload.suppliers ?? []);
      setPurchases(purchasePayload.purchases ?? []);
      setPurchasePagination(purchasePayload.pagination ?? { page: 1, limit: 10, total: 0 });
      setPayables(payablePayload.payables ?? []);
      setPayablePagination(payablePayload.pagination ?? { page: 1, limit: 10, total: 0 });
      setAging(agingPayload.aging ?? null);
      setLocations(locationPayload.locations ?? []);
      if (!purchaseForm.locationId && locationPayload.locations?.[0]) { setPurchaseForm((c) => ({ ...c, locationId: c.locationId || locationPayload.locations[0].id })); }
      setMessage('Purchases ready.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  };

  // Load categories and brands for Quick Add
  useEffect(() => {
    Promise.all([
      readJson<{ categories: Array<{ id: string; name: string }> }>('/api/catalog/categories?limit=200'),
      readJson<{ brands: Array<{ id: string; name: string }> }>('/api/catalog/brands?limit=200'),
    ]).then(([c, b]) => { setCategories(c.categories ?? []); setBrands(b.brands ?? []); }).catch(() => {});
    void refresh();
  }, []);

  // ── SKU search ──

  const searchSkus = async () => {
    if (!skuSearch.trim()) { setSkuResults([]); return; }
    setSkuSearching(true);
    try {
      const payload = await readJson<{ skus: SkuResult[] }>(`/api/catalog/skus/search?q=${encodeURIComponent(skuSearch.trim())}&limit=12`);
      setSkuResults(payload.skus ?? []);
      setShowSkuSuggestions((payload.skus?.length ?? 0) > 0);
      setMessage(`Found ${payload.skus?.length ?? 0} SKU(s).`);
    } catch (error) { setMessage((error as Error).message); }
    finally { setSkuSearching(false); }
  };

  // Debounce auto-search for SKU lookup (like POS)
  useEffect(() => {
    if (skuDebounceRef.current) clearTimeout(skuDebounceRef.current);
    if (!skuSearch.trim()) {
      setSkuResults([]);
      setShowSkuSuggestions(false);
      setSkuSearching(false);
      return;
    }
    setSkuSearching(true);
    skuDebounceRef.current = setTimeout(() => { void searchSkus(); }, 150);
    return () => { if (skuDebounceRef.current) clearTimeout(skuDebounceRef.current); };
  }, [skuSearch]);

  const addSkuItem = (sku: SkuResult) => {
    setItems((cur) => {
      if (cur.find((i) => i.skuId === sku.id)) return cur;
      return [...cur, { skuId: sku.id, label: `${sku.product_name}${sku.variant_label ? ` · ${sku.variant_label}` : ''} (${sku.sku_code})`, qty: lineDefaults.qty, unitCost: lineDefaults.unitCost || String(sku.cost_price || ''), batchNo: '', expiryDate: '' }];
    });
    setSkuResults([]);
    setSkuSearch('');
  };

  // ── Quick Receive ──

  // Quick variant row helpers
  const addVariantRow = () => {
    const label = quickVariantInput.trim();
    if (!label) return;
    setQuickVariantRows((cur) => [...cur, {
      key: String(Date.now()),
      label,
      price: quickVariantPrice || quickVariantRows[quickVariantRows.length - 1]?.price || '',
      cost: quickVariantCost || quickVariantRows[quickVariantRows.length - 1]?.cost || '',
      qty: quickVariantQty || '1',
    }]);
    setQuickVariantInput(''); setQuickVariantPrice(''); setQuickVariantCost(''); setQuickVariantQty('1');
  };

  const quickReceive = async () => {
    if (!quickName.trim() || !quickSupplierId || !quickLocationId) { setMessage('Product name, supplier, and location are required.'); return; }
    const hasRows = quickHasVariants && quickVariantRows.length > 0;
    if (!hasRows && quickHasVariants) { setMessage('Add at least one variant row, or uncheck Has Variants.'); return; }
    setQuickSaving(true);
    try {
      const bodies = hasRows ? quickVariantRows.map((row) => ({
        productName: `${quickName.trim()} · ${row.label}`,
        supplierId: quickSupplierId, locationId: quickLocationId,
        categoryId: quickCategoryId || undefined, brandId: quickBrandId || undefined,
        salePrice: Number(row.price || 0), purchaseQty: Number(row.qty || 1),
        unitCost: Number(row.cost || 0), paidAmount: Number(quickPaid || 0),
        hasVariants: false, variantLabels: undefined, isTrackable: true, note: '',
      })) : [{
        productName: quickName.trim(),
        supplierId: quickSupplierId, locationId: quickLocationId,
        categoryId: quickCategoryId || undefined, brandId: quickBrandId || undefined,
        salePrice: Number(quickVariantRows[0]?.price || 0) || 0,
        purchaseQty: Number(quickVariantRows[0]?.qty || 1),
        unitCost: Number(quickVariantRows[0]?.cost || 0),
        paidAmount: Number(quickPaid || 0),
        hasVariants: false, variantLabels: undefined, isTrackable: true, note: '',
      }];

      let lastResult: any = null;
      for (const body of bodies) {
        lastResult = await readJson<any>('/api/store-ops/quick-receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      const count = bodies.length;
      setMessage(`✓ Created ${count > 1 ? `${count} products` : `"${lastResult?.product?.name}"`} — stock updated. ${lastResult?.purchase?.purchaseNo ? `Purchase ${lastResult.purchase.purchaseNo}.` : ''}`);
      setQuickName(''); setQuickVariantRows([]); setQuickHasVariants(false);
      setQuickPaid(''); setQuickCategoryId(''); setQuickBrandId('');
      await refresh();
    } catch (error) { const msg = (error as Error).message; setMessage(msg); toast.error(msg); }
    finally { setQuickSaving(false); }
  };


  // ── Regular Purchase ──

  const createPurchase = async () => {
    if (!purchaseForm.supplierId || !purchaseForm.locationId) { setMessage('Choose a supplier and inventory location first.'); return; }
    if (!items.length) { setMessage('Add at least one SKU line to receive stock.'); return; }
    setLoading(true);
    try {
      const payload = await readJson<{ purchaseId: string; purchaseNo: string; totalAmount: number; paidAmount: number; paymentStatus: string }>('/api/store-ops/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplierId: purchaseForm.supplierId, locationId: purchaseForm.locationId, purchaseDate: purchaseForm.purchaseDate, invoiceNo: purchaseForm.invoiceNo.trim() || undefined, discountAmount: Number(purchaseForm.discountAmount || 0), taxAmount: Number(purchaseForm.taxAmount || 0), shippingAmount: Number(purchaseForm.shippingAmount || 0), paidAmount: Number(purchaseForm.paidAmount || 0), paymentMethod: purchaseForm.paymentMethod, paymentReferenceNo: purchaseForm.paymentReference || undefined, note: purchaseForm.note || undefined, items: items.map((i) => ({ skuId: i.skuId, qty: Number(i.qty), unitCost: Number(i.unitCost), batchNo: i.batchNo || undefined, expiryDate: i.expiryDate || undefined })) }) });
      setMessage(`✓ Purchase ${payload.purchaseNo} received. Stock updated.`);
      setItems([]); setSkuSearch(''); setSkuResults([]);
      setPurchaseForm((c) => ({ ...c, invoiceNo: '', discountAmount: '0', taxAmount: '0', shippingAmount: '0', paidAmount: '0', paymentReference: '', note: '' }));
      await refresh();
    } catch (error) { const msg = (error as Error).message; setMessage(msg); toast.error(msg); }
    finally { setLoading(false); }
  };


  // ── Payables sort ──

  const handlePayableSort = (column: string) => {
    const nextSortBy = column;
    const nextSortDir = payableSortBy === column
      ? (payableSortDir === 'asc' ? 'desc' : 'asc')
      : 'desc';
    setPayableSortBy(nextSortBy);
    setPayableSortDir(nextSortDir);
    setPayablePage(1);
    const qs = `page=1&limit=10&search=${encodeURIComponent(payableSearch)}&sortBy=${nextSortBy}&sortDir=${nextSortDir}`;
    readJson<{ payables: PayableRow[]; pagination?: PaginationState }>(`/api/store-ops/payables?${qs}`)
      .then((payload) => { setPayables(payload.payables ?? []); setPayablePagination(payload.pagination ?? { page: 1, limit: 10, total: 0 }); })
      .catch((error) => setMessage((error as Error).message));
  };

  const sortIndicator = (column: string) => {
    if (payableSortBy !== column) return '';
    return payableSortDir === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      {/* ── Navigation pager ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>{message}</p>
        <WorkspaceTabs active={activeTab} onChange={(key) => setActiveTab(key as any)} tabs={[{ key: 'receive', label: 'Receive Stock' }, { key: 'purchases', label: 'Purchases' }, { key: 'payables', label: 'Payables' }]} />
      </div>

      {/* ═══════════════ Receive Stock Tab ═══════════════ */}
      {activeTab === 'receive' ? (
      <section style={{ display: 'grid', gap: 14 }}>
        {/* ── Quick Add Product + Receive Stock ── */}
        <article style={{ ...surfaceCardStyle, border: '2px solid #1e293b', padding: 14 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>New Product + Receive Stock</h3>
          <p style={{ margin: '0 0 14px', color: 'var(--muted-foreground)', fontSize: 12 }}>Name the product, choose category/brand, add variants, set prices, receive stock — all in one form.</p>

          {/* Product name */}
          <input value={quickName} onChange={(e) => setQuickName(e.target.value)} style={{ ...fieldStyle, marginBottom: 10 }} placeholder="Product name (required)" />

          {/* Category + Brand */}
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <SearchableSelect
              options={categoryOpts}
              value={quickCategoryId}
              onChange={setQuickCategoryId}
              placeholder="No category"
              emptyMessage="No categories found"
            />
            <SearchableSelect
              options={brandOpts}
              value={quickBrandId}
              onChange={setQuickBrandId}
              placeholder="No brand"
              emptyMessage="No brands found"
            />
          </div>

          {/* Variants toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={quickHasVariants} onChange={(e) => { setQuickHasVariants(e.target.checked); if (!e.target.checked) setQuickVariantRows([]); }} style={{ accentColor: '#0f172a' }} />
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Has variants (sizes, colors, etc.)</span>
          </label>



          {/* Variant input row */}
          {quickHasVariants ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <input value={quickVariantInput} onChange={(e) => setQuickVariantInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVariantRow(); } }} style={{ ...fieldStyle, flex: 1, minWidth: 100 }} placeholder="Variant label (e.g. 90/90-12)" />
                <input value={quickVariantPrice} onChange={(e) => setQuickVariantPrice(e.target.value)} style={{ ...fieldStyle, width: 90 }} placeholder="Price" />
                <input value={quickVariantCost} onChange={(e) => setQuickVariantCost(e.target.value)} style={{ ...fieldStyle, width: 90 }} placeholder="Cost" />
                <input value={quickVariantQty} onChange={(e) => setQuickVariantQty(e.target.value)} style={{ ...fieldStyle, width: 70 }} placeholder="Qty" />
                <button onClick={addVariantRow} style={{ ...gray800ButtonStyle, minWidth: 60, fontSize: 11 }} disabled={loading || !quickVariantInput.trim()}>Add</button>
              </div>

              {quickVariantRows.length ? (
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead><tr><th style={tableHeaderCellStyle}>Variant</th><th style={tableHeaderCellStyle}>Price</th><th style={tableHeaderCellStyle}>Cost</th><th style={tableHeaderCellStyle}>Qty</th><th style={tableHeaderCellStyle}></th></tr></thead>
                    <tbody>
                      {quickVariantRows.map((row) => (
                        <tr key={row.key}>
                          <td style={tableCellStyle}><strong>{row.label}</strong></td>
                          <td style={tableCellStyle}>{row.price ? `BDT ${Number(row.price).toFixed(2)}` : '—'}</td>
                          <td style={tableCellStyle}>{row.cost ? `BDT ${Number(row.cost).toFixed(2)}` : '—'}</td>
                          <td style={tableCellStyle}>{row.qty}</td>
                          <td style={tableCellStyle}><button onClick={() => setQuickVariantRows((cur) => cur.filter((r) => r.key !== row.key))} style={dangerButtonStyle}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : (
            /* Simple product — single price/cost/qty row */
            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 10 }}>
              <input type="number" min="0" step="0.01" value={quickVariantRows[0]?.price || ''} onChange={(e) => setQuickVariantRows([{ key: 'simple', label: quickName || 'default', price: e.target.value, cost: quickVariantRows[0]?.cost || '', qty: quickVariantRows[0]?.qty || '1' }])} style={fieldStyle} placeholder="Sale price (BDT)" />
              <input type="number" min="0" step="0.01" value={quickVariantRows[0]?.cost || ''} onChange={(e) => setQuickVariantRows([{ key: 'simple', label: quickName || 'default', price: quickVariantRows[0]?.price || '', cost: e.target.value, qty: quickVariantRows[0]?.qty || '1' }])} style={fieldStyle} placeholder="Unit cost (BDT)" />
              <input type="number" min="1" step="1" value={quickVariantRows[0]?.qty || '1'} onChange={(e) => setQuickVariantRows([{ key: 'simple', label: quickName || 'default', price: quickVariantRows[0]?.price || '', cost: quickVariantRows[0]?.cost || '', qty: e.target.value }])} style={fieldStyle} placeholder="Quantity" />
            </div>
          )}

          {/* Supplier + Location + Paid */}
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
            <SearchableSelect
              options={supplierOpts}
              value={quickSupplierId}
              onChange={setQuickSupplierId}
              placeholder="Supplier (required)"
              emptyMessage="No suppliers found"
            />
            <SearchableSelect
              options={locationOpts}
              value={quickLocationId}
              onChange={setQuickLocationId}
              placeholder="Location (required)"
              emptyMessage="No locations found"
            />
            <input type="number" min="0" step="0.01" value={quickPaid} onChange={(e) => setQuickPaid(e.target.value)} style={fieldStyle} placeholder="Paid amount (BDT)" />
          </div>

          <button onClick={quickReceive} style={{ ...gray800ButtonStyle, width: '100%', minHeight: 36 }} disabled={loading || quickSaving || !quickName.trim()}>
            {quickSaving ? 'Saving...' : `Create & Receive Stock (${quickHasVariants && quickVariantRows.length ? quickVariantRows.length : 1} item${quickHasVariants && quickVariantRows.length > 1 ? 's' : ''})`}
          </button>
        </article>

        {/* ── Regular Purchase (existing products) ── */}
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>Receive Existing Products</h3>
          <p style={{ margin: '0 0 12px', color: 'var(--muted-foreground)', fontSize: 12 }}>Add products already in your catalog. Use Quick Add above for new products.</p>



          <div style={{ ...stackedFilterGridStyle, marginBottom: 10 }}>
            <SearchableSelect
              options={supplierOpts}
              value={purchaseForm.supplierId}
              onChange={(v) => setPurchaseForm((c) => ({ ...c, supplierId: v }))}
              placeholder="Select supplier"
              emptyMessage="No suppliers found"
            />
            <SearchableSelect
              options={locationOpts}
              value={purchaseForm.locationId}
              onChange={(v) => setPurchaseForm((c) => ({ ...c, locationId: v }))}
              placeholder="Select location"
              emptyMessage="No locations found"
            />
            <input type="date" value={purchaseForm.purchaseDate} onChange={(e) => setPurchaseForm((c) => ({ ...c, purchaseDate: e.target.value }))} style={fieldStyle} />
            <input value={purchaseForm.invoiceNo} onChange={(e) => setPurchaseForm((c) => ({ ...c, invoiceNo: e.target.value }))} style={fieldStyle} placeholder="Invoice no (optional)" />
          </div>

          {/* SKU search */}
          <div style={{ position: 'relative' }}>
            <div style={{ ...searchRowStyle, marginBottom: 10 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input value={skuSearch} onChange={(e) => { setSkuSearch(e.target.value); if (e.target.value) setShowSkuSuggestions(true); }} onFocus={() => { if (skuResults.length > 0) setShowSkuSuggestions(true); }} onBlur={() => setTimeout(() => setShowSkuSuggestions(false), 200)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setShowSkuSuggestions(false); void searchSkus(); } }} style={{ ...fieldStyle, width: '100%' }} placeholder="Search existing product or SKU to add" />
                {skuSearching ? <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)', fontSize: 12 }}>searching...</span> : null}
              </div>
              <button onClick={() => { setShowSkuSuggestions(false); searchSkus(); }} style={searchButtonStyle} disabled={skuSearching}>Find</button>
            </div>

            {showSkuSuggestions && skuResults.length > 0 ? (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 50, marginTop: -6, background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxHeight: 340, overflowY: 'auto', marginBottom: 10 }}>
                {skuResults.map((sku) => (
                  <div key={sku.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { addSkuItem(sku); }} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{sku.product_name}</div>
                      <div style={{ color: 'var(--muted-foreground)', fontSize: 12, marginTop: 2 }}>{sku.sku_code}{sku.variant_label ? ` · ${sku.variant_label}` : ''} · Stock: {Number(sku.available_qty ?? 0)} · BDT {formatMoney(sku.sale_price)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {items.length ? (
            <div style={{ ...tableWrapStyle, marginBottom: 10 }}>
              <table style={tableStyle}>
                <thead><tr><th style={tableHeaderCellStyle}>Item</th><th style={tableHeaderCellStyle}>Qty</th><th style={tableHeaderCellStyle}>Unit Cost</th><th style={tableHeaderCellStyle}>Total</th><th style={tableHeaderCellStyle}></th></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.skuId}>
                      <td style={tableCellStyle}>{item.label}</td>
                      <td style={tableCellStyle}><input type="number" min="0" step="1" value={item.qty} onChange={(e) => setItems((c) => c.map((i) => i.skuId === item.skuId ? { ...i, qty: e.target.value } : i))} style={{ ...fieldStyle, width: 80 }} /></td>
                      <td style={tableCellStyle}><input type="number" min="0" step="0.01" value={item.unitCost} onChange={(e) => setItems((c) => c.map((i) => i.skuId === item.skuId ? { ...i, unitCost: e.target.value } : i))} style={{ ...fieldStyle, width: 100 }} /></td>
                      <td style={tableCellStyle}>{formatMoney(Number(item.qty || 0) * Number(item.unitCost || 0))}</td>
                      <td style={tableCellStyle}><button onClick={() => setItems((c) => c.filter((i) => i.skuId !== item.skuId))} style={dangerButtonStyle}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ ...emptyStateStyle, marginBottom: 10 }}>Search and add at least one SKU to receive stock.</div>
          )}

          {/* Totals + Receive */}
          <details style={{ marginBottom: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}>Payment details</summary>
            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 8 }}>
              <input type="number" min="0" step="0.01" value={purchaseForm.discountAmount} onChange={(e) => setPurchaseForm((c) => ({ ...c, discountAmount: e.target.value }))} style={fieldStyle} placeholder="Discount" />
              <input type="number" min="0" step="0.01" value={purchaseForm.taxAmount} onChange={(e) => setPurchaseForm((c) => ({ ...c, taxAmount: e.target.value }))} style={fieldStyle} placeholder="Tax" />
              <input type="number" min="0" step="0.01" value={purchaseForm.shippingAmount} onChange={(e) => setPurchaseForm((c) => ({ ...c, shippingAmount: e.target.value }))} style={fieldStyle} placeholder="Shipping" />
              <input type="number" min="0" step="0.01" value={purchaseForm.paidAmount} onChange={(e) => setPurchaseForm((c) => ({ ...c, paidAmount: e.target.value }))} style={fieldStyle} placeholder="Paid now" />
              <select value={purchaseForm.paymentMethod} onChange={(e) => setPurchaseForm((c) => ({ ...c, paymentMethod: e.target.value as any }))} style={fieldStyle}>
                <option value="cash">Cash</option><option value="card">Card</option><option value="mfs">MFS</option><option value="bank_transfer">Bank</option>
              </select>
              <input value={purchaseForm.paymentReference} onChange={(e) => setPurchaseForm((c) => ({ ...c, paymentReference: e.target.value }))} style={fieldStyle} placeholder="Ref no" />
            </div>
            <input value={purchaseForm.note} onChange={(e) => setPurchaseForm((c) => ({ ...c, note: e.target.value }))} style={{ ...fieldStyle, marginTop: 8 }} placeholder="Note (optional)" />
          </details>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: 'var(--muted-foreground)' }}>Subtotal: </span><strong>BDT {formatMoney(lineTotal.subtotal)}</strong>
              <span style={{ color: 'var(--muted-foreground)', marginLeft: 12 }}>Total: </span><strong style={{ fontSize: 16 }}>BDT {formatMoney(lineTotal.total)}</strong>
              {lineTotal.outstanding > 0 ? <span style={{ color: '#b45309', marginLeft: 8, fontSize: 12 }}>(BDT {formatMoney(lineTotal.outstanding)} unpaid)</span> : null}
            </div>
            <button onClick={createPurchase} style={{ ...gray800ButtonStyle, minHeight: 36, minWidth: 180 }} disabled={loading || !items.length}>
              {loading ? 'Saving...' : 'Receive Stock'}
            </button>
          </div>
        </article>

      </section>
      ) : null}

      {/* ═══════════════ Purchases Tab ═══════════════ */}
      {activeTab === 'purchases' ? (
      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Purchase History</h3>
        <div style={{ ...searchRowStyle, marginBottom: 10 }}>
          <input value={purchaseSearch} onChange={(e) => setPurchaseSearch(e.target.value)} style={{ ...fieldStyle, flex: 1, width: 'auto' }} placeholder="Search purchase no, invoice, or supplier" />
          <select value={purchaseStatus} onChange={(e) => setPurchaseStatus(e.target.value)} style={{ ...fieldStyle, width: 160 }}>
            <option value="">All statuses</option><option value="received">Received</option><option value="draft">Draft</option><option value="cancelled">Cancelled</option>
          </select>
          <button onClick={() => void refresh(supplierPage, 1, payablePage)} style={searchButtonStyle} disabled={loading}>Search</button>
        </div>
        {purchases.length ? (
          <>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead><tr><th style={tableHeaderCellStyle}>Purchase No</th><th style={tableHeaderCellStyle}>Date</th><th style={tableHeaderCellStyle}>Supplier</th><th style={tableHeaderCellStyle}>Location</th><th style={tableHeaderCellStyle}>Total</th><th style={tableHeaderCellStyle}>Paid</th><th style={tableHeaderCellStyle}>Status</th></tr></thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id}>
                      <td style={tableCellStyle}><div style={{ fontWeight: 600 }}>{p.purchase_no}</div></td>
                      <td style={tableCellStyle}>{p.purchase_date}</td>
                      <td style={tableCellStyle}>{p.supplier_name}</td>
                      <td style={tableCellStyle}>{p.location_name}</td>
                      <td style={tableCellStyle}>{formatMoney(p.total_amount)}</td>
                      <td style={tableCellStyle}>{formatMoney(p.paid_amount)}</td>
                      <td style={tableCellStyle}>{p.payment_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPager
              page={purchasePagination.page}
              pagination={purchasePagination}
              label="purchases"
              onNext={() => { const np = purchasePage + 1; setPurchasePage(np); void refresh(supplierPage, np, payablePage); }}
              onPrevious={() => { const np = Math.max(1, purchasePage - 1); setPurchasePage(np); void refresh(supplierPage, np, payablePage); }}
            />
          </>
        ) : <div style={emptyStateStyle}>No purchases found. Receive stock to see purchases here.</div>}
      </article>
      ) : null}

      {/* ═══════════════ Payables Tab ═══════════════ */}
      {activeTab === 'payables' ? (
      <>
        {/* Aging summary */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <MetricTile label="Today" amount={aging?.today_amount} count={aging?.today_count} />
          <MetricTile label="1-7 days" amount={aging?.days_7_amount} count={aging?.days_7_count} />
          <MetricTile label="8-30 days" amount={aging?.days_30_amount} count={aging?.days_30_count} />
          <MetricTile label="31-90 days" amount={aging?.days_90_amount} count={aging?.days_90_count} />
          <MetricTile label="90+ days" amount={aging?.days_90_plus_amount} count={aging?.days_90_plus_count} />
        </section>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Supplier Payables</h3>
          <div style={{ ...searchRowStyle, marginBottom: 10 }}>
            <input value={payableSearch} onChange={(e) => setPayableSearch(e.target.value)} style={{ ...fieldStyle, flex: 1, width: 'auto' }} placeholder="Search purchase no, invoice, supplier, or phone" />
            <button onClick={() => void refresh(supplierPage, purchasePage, 1)} style={searchButtonStyle} disabled={loading}>Search</button>

          </div>
          {payables.length ? (
            <>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead><tr>
                    <th style={tableHeaderCellStyle} onClick={() => handlePayableSort('purchase_date')}>
                      Date{sortIndicator('purchase_date')}
                    </th>
                    <th style={tableHeaderCellStyle} onClick={() => handlePayableSort('supplier_name')}>
                      Supplier{sortIndicator('supplier_name')}
                    </th>
                    <th style={tableHeaderCellStyle}>Purchase No</th>
                    <th style={tableHeaderCellStyle}>Total</th>
                    <th style={tableHeaderCellStyle} onClick={() => handlePayableSort('outstanding_amount')}>
                      Outstanding{sortIndicator('outstanding_amount')}
                    </th>
                    <th style={tableHeaderCellStyle} onClick={() => handlePayableSort('aging_days')}>
                      Age (days){sortIndicator('aging_days')}
                    </th>
                  </tr></thead>
                  <tbody>
                    {payables.map((p) => (
                      <tr key={p.id}>
                        <td style={tableCellStyle}>{p.purchase_date}</td>
                        <td style={tableCellStyle}><div style={{ fontWeight: 600 }}>{p.supplier_name}</div>{p.supplier_phone ? <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{p.supplier_phone}</div> : null}</td>
                        <td style={tableCellStyle}>{p.purchase_no}</td>
                        <td style={tableCellStyle}>{formatMoney(p.total_amount)}</td>
                        <td style={tableCellStyle}><strong style={{ color: Number(p.outstanding_amount) > 0 ? '#b45309' : '#16a34a' }}>{formatMoney(p.outstanding_amount)}</strong></td>
                        <td style={tableCellStyle}>{p.aging_days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPager
                page={payablePagination.page} pagination={payablePagination} label="payables"
                onNext={() => { const np = payablePage + 1; setPayablePage(np); void refresh(supplierPage, purchasePage, np); }}
                onPrevious={() => { const np = Math.max(1, payablePage - 1); setPayablePage(np); void refresh(supplierPage, purchasePage, np); }}
              />
            </>
          ) : <div style={emptyStateStyle}>No payables found. Receive a purchase first.</div>}
        </article>

      </>
      ) : null}
    </section>
  );
}
