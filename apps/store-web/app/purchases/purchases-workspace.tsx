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
} from '../merchflow-theme';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';
import { searchRowStyle, stackedFilterGridStyle, useCompactLayout, WorkspaceTabs } from '../workspace-responsive';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/searchable-select';
import { printProductLabelBatch, fetchPrintAgentHealth } from '../../lib/print-agent';
import { loadWorkstationProfile } from '../../lib/workstation-profile';
import { TrackingInput, type TrackingField } from './tracking-input';
import { QuickScanTab } from './quick-scan-tab';
import { BatchPasteTab } from './batch-paste-tab';
import { CsvUploadTab } from './csv-upload-tab';

type Supplier = { id: string; company_name: string; contact_name?: string | null; phone?: string | null; opening_payable_amount?: string | number; current_payable_amount?: string | number };
type Location = { id: string; code: string; name: string; location_type: string };
type Purchase = { id: string; purchase_no: string; purchase_date: string; supplier_name: string; location_name: string; total_amount: string | number; paid_amount: string | number; payment_status: string; status: string; created_at: string };
type PayableRow = { id: string; purchase_no: string; supplier_name: string; supplier_phone?: string | null; invoice_no?: string | null; purchase_date: string; total_amount: string | number; outstanding_amount: string | number; aging_days: number };
type SkuResult = { id: string; sku_code: string; product_name: string; product_code?: string | null; variant_label?: string | null; barcode?: string | null; sale_price?: string | number | null; cost_price?: string | number | null; available_qty?: string | number | null };
type Aging = { today_amount?: string | number; today_count?: number; days_7_amount?: string | number; days_7_count?: number; days_30_amount?: string | number; days_30_count?: number; days_90_amount?: string | number; days_90_count?: number; days_90_plus_amount?: string | number; days_90_plus_count?: number };
type ProductWithProfile = {
  id: string;
  name: string;
  product_code: string;
  category_id?: string;
  trackingProfile?: { id: string; name: string; fields: TrackingField[] } | null;
  skus?: Array<{ id: string; sku_code: string; variant_label?: string; cost_price?: string | number; sale_price?: string | number }>;
};
type ReceiveUnit = {
  id: string;
  values: Record<string, string>;
  errors: Record<string, string>;
};

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

  // ── Receive Flow State ──
  const [receiveProductId, setReceiveProductId] = useState('');
  const [receiveProduct, setReceiveProduct] = useState<ProductWithProfile | null>(null);
  const [receiveProductSearch, setReceiveProductSearch] = useState('');
  const [receiveProductResults, setReceiveProductResults] = useState<ProductWithProfile[]>([]);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [receiveUnits, setReceiveUnits] = useState<ReceiveUnit[]>([]);
  const [receiveSkuId, setReceiveSkuId] = useState('');
  const [receiveSupplierId, setReceiveSupplierId] = useState('');
  const [receiveLocationId, setReceiveLocationId] = useState('');
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [receiveEntryMode, setReceiveEntryMode] = useState<'quick-scan' | 'batch-paste' | 'csv-upload'>('quick-scan');

  // Regular purchase form
  const [purchaseForm, setPurchaseForm] = useState({ supplierId: '', locationId: '', purchaseDate: new Date().toISOString().slice(0, 10), invoiceNo: '', discountAmount: '0', taxAmount: '0', shippingAmount: '0', paidAmount: '0', paymentMethod: 'cash' as 'cash' | 'card' | 'mfs' | 'bank_transfer', paymentReference: '', note: '' });
  const [items, setItems] = useState<Array<{ skuId: string; label: string; qty: string; unitCost: string; batchNo: string; expiryDate: string }>>([]);
  const [lineDefaults, setLineDefaults] = useState({ qty: '1', unitCost: '' });

  // Last received items for print labels prompt
  const [lastReceivedItems, setLastReceivedItems] = useState<Array<{ sku: string; productName: string; sellingPrice?: number | null }>>([]);
  const [printingLabels, setPrintingLabels] = useState(false);

  const supplierOptions = useMemo(() => suppliers.map((s) => ({ id: s.id, company_name: s.company_name })), [suppliers]);
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
      if (!receiveLocationId && locationPayload.locations?.[0]) {
        setReceiveLocationId(locationPayload.locations[0].id);
        setPurchaseForm((c) => ({ ...c, locationId: c.locationId || locationPayload.locations[0].id }));
      }
      setMessage('Purchases ready.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // ── Product Search for Receive ──

  const searchReceiveProducts = async (q: string) => {
    if (!q.trim()) { setReceiveProductResults([]); return; }
    try {
      const payload = await readJson<{ products: ProductWithProfile[] }>(`/api/catalog/products?q=${encodeURIComponent(q.trim())}&limit=10`);
      setReceiveProductResults(payload.products ?? []);
      setShowProductSuggestions(true);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const t = setTimeout(() => { if (receiveProductSearch) searchReceiveProducts(receiveProductSearch); }, 200);
    return () => clearTimeout(t);
  }, [receiveProductSearch]);

  const selectReceiveProduct = async (product: ProductWithProfile) => {
    setReceiveProductId(product.id);
    setReceiveProductSearch(product.name);
    setShowProductSuggestions(false);
    // Fetch full product with tracking profile
    try {
      const res = await readJson<{ product: any; trackingProfile: any; skus: any[] }>(`/api/catalog/products/${product.id}`);
      setReceiveProduct({
        id: res.product.id,
        name: res.product.name,
        product_code: res.product.product_code,
        category_id: res.product.category_id,
        trackingProfile: res.trackingProfile ?? null,
        skus: res.skus ?? [],
      });
      if (res.skus?.length === 1) setReceiveSkuId(res.skus[0].id);
      setReceiveUnits([]);
    } catch { /* ignore */ }
  };

  // ── Tracking Unit Management ──

  const addTrackingUnit = (values: Record<string, string>) => {
    const fields = receiveProduct?.trackingProfile?.fields || [];
    const errors: Record<string, string> = {};
    for (const f of fields) {
      if (f.isRequired && !values[f.fieldKey]?.trim()) {
        errors[f.fieldKey] = `${f.fieldLabel} is required`;
      }
      if (f.isUnique && values[f.fieldKey]?.trim()) {
        // Check for duplicates in current units
        const dup = receiveUnits.find(
          (u) => u.values[f.fieldKey]?.trim() === values[f.fieldKey]?.trim() && u.id !== 'new',
        );
        if (dup) errors[f.fieldKey] = `Duplicate ${f.fieldLabel}`;
      }
    }
    setReceiveUnits((prev) => [...prev, { id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, values, errors }]);
  };

  const addTrackingUnits = (units: Record<string, string>[]) => {
    const fields = receiveProduct?.trackingProfile?.fields || [];
    const newUnits: ReceiveUnit[] = units.map((values) => {
      const errors: Record<string, string> = {};
      for (const f of fields) {
        if (f.isRequired && !values[f.fieldKey]?.trim()) {
          errors[f.fieldKey] = `${f.fieldLabel} is required`;
        }
      }
      return { id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, values, errors };
    });
    setReceiveUnits((prev) => [...prev, ...newUnits]);
  };

  const removeUnit = (unitId: string) => {
    setReceiveUnits((prev) => prev.filter((u) => u.id !== unitId));
  };

  const updateUnitField = (unitId: string, key: string, value: string) => {
    setReceiveUnits((prev) => prev.map((u) => {
      if (u.id !== unitId) return u;
      const newValues = { ...u.values, [key]: value };
      // Clear error for this field
      const newErrors = { ...u.errors };
      delete newErrors[key];
      return { ...u, values: newValues, errors: newErrors };
    }));
  };

  // ── Receive Submit ──

  const receiveStock = async () => {
    if (!receiveProductId) { setMessage('Select a product first.'); return; }
    if (!receiveSupplierId) { setMessage('Select a supplier.'); return; }
    if (!receiveLocationId) { setMessage('Select a location.'); return; }
    if (receiveUnits.length === 0) { setMessage('Add at least one unit.'); return; }

    // Validate all units
    const fields = receiveProduct?.trackingProfile?.fields || [];
    let hasErrors = false;
    const validatedUnits = receiveUnits.map((unit) => {
      const errors: Record<string, string> = {};
      for (const f of fields) {
        if (f.isRequired && !unit.values[f.fieldKey]?.trim()) {
          errors[f.fieldKey] = `${f.fieldLabel} is required`;
          hasErrors = true;
        }
      }
      return { ...unit, errors };
    });
    setReceiveUnits(validatedUnits);
    if (hasErrors) { setMessage('Fix the errors below.'); return; }

    setReceiveSaving(true);
    try {
      const trackingValuesList = receiveUnits.map((u) => u.values);
      const res = await readJson<any>('/api/store-ops/purchases/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: receiveProductId,
          skuId: receiveSkuId || undefined,
          supplierId: receiveSupplierId,
          locationId: receiveLocationId,
          trackingValuesList,
        }),
      });

      // Store received items for print labels
      const receivedItems: Array<{ sku: string; productName: string; sellingPrice?: number | null }> = [];
      if (res?.sku) {
        receivedItems.push({
          sku: res.sku.barcode || res.sku.skuCode || res.sku.id,
          productName: res.product?.name || receiveProduct?.name || '',
          sellingPrice: res.sku.salePrice || null,
        });
      }
      setLastReceivedItems(receivedItems);

      setMessage(`✓ Received ${receiveUnits.length} unit(s) for "${receiveProduct?.name}". ${res?.purchase?.purchaseNo ? `Purchase ${res.purchase.purchaseNo}.` : ''}`);
      toast.success(`Received ${receiveUnits.length} unit(s)`);
      setReceiveUnits([]);
      setReceiveProductId('');
      setReceiveProduct(null);
      setReceiveProductSearch('');
      setReceiveSkuId('');
      await refresh();
    } catch (error) {
      const msg = (error as Error).message;
      setMessage(msg);
      toast.error(msg);
    } finally {
      setReceiveSaving(false);
    }
  };

  // ── Print Labels ──

  const printReceivedLabels = async () => {
    if (!lastReceivedItems.length) return;
    setPrintingLabels(true);
    try {
      const profile = loadWorkstationProfile();
      await printProductLabelBatch({
        items: lastReceivedItems.map((item) => ({
          sku: item.sku,
          productName: item.productName,
          storeName: 'Store',
          sellingPrice: item.sellingPrice,
        })),
        printerName: profile.labelPrinterName || undefined,
        widthMm: 40,
        heightMm: 25,
        barcodeType: '128',
        border: true,
      }, profile.agentUrl);
      toast.success(`Printed ${lastReceivedItems.length} label(s)`);
      setLastReceivedItems([]);
      setMessage('Labels printed successfully.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPrintingLabels(false);
    }
  };

  // ── SKU search (for regular purchase) ──

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
        {/* ── Product Selection ── */}
        <article style={{ ...surfaceCardStyle, border: '2px solid #1e293b', padding: 14 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>Select Product to Receive</h3>
          <p style={{ margin: '0 0 14px', color: 'var(--muted-foreground)', fontSize: 12 }}>
            Search for an existing product. Tracking fields will appear automatically if the product has a tracking profile.
          </p>

          {/* Product Search */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input
              value={receiveProductSearch}
              onChange={(e) => { setReceiveProductSearch(e.target.value); setShowProductSuggestions(true); }}
              onFocus={() => { if (receiveProductResults.length > 0) setShowProductSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowProductSuggestions(false), 200)}
              style={{ ...fieldStyle, width: '100%' }}
              placeholder="Search product name or code..."
            />
            {showProductSuggestions && receiveProductResults.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 50, marginTop: 4, background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxHeight: 260, overflowY: 'auto' }}>
                {receiveProductResults.map((p) => (
                  <div key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => selectReceiveProduct(p)} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                    <div style={{ color: 'var(--muted-foreground)', fontSize: 12, marginTop: 2 }}>{p.product_code}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected Product Info */}
          {receiveProduct && (
            <div style={{ background: 'var(--muted)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{receiveProduct.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{receiveProduct.product_code}</div>
                </div>
                <button onClick={() => { setReceiveProduct(null); setReceiveProductId(''); setReceiveProductSearch(''); setReceiveUnits([]); }} style={{ ...subtleButtonStyle, fontSize: 11 }}>Change</button>
              </div>

              {/* Tracking Profile Badge */}
              {receiveProduct.trackingProfile && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 6, background: '#dbeafe', color: '#1e40af', padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>
                    {receiveProduct.trackingProfile.name}
                    <span style={{ marginLeft: 6, background: '#93c5fd', borderRadius: 4, padding: '0 5px', fontSize: 10 }}>
                      {receiveProduct.trackingProfile.fields.length} fields
                    </span>
                  </span>
                </div>
              )}

              {/* SKU Selection (if multiple SKUs) */}
              {receiveProduct.skus && receiveProduct.skus.length > 1 && (
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4, display: 'block' }}>Select SKU variant</label>
                  <select value={receiveSkuId} onChange={(e) => setReceiveSkuId(e.target.value)} style={{ ...fieldStyle, width: '100%' }}>
                    <option value="">Default SKU</option>
                    {receiveProduct.skus.map((sku) => (
                      <option key={sku.id} value={sku.id}>{sku.sku_code}{sku.variant_label ? ` · ${sku.variant_label}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Supplier & Location */}
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <SearchableSelect
              options={supplierOpts}
              value={receiveSupplierId}
              onChange={setReceiveSupplierId}
              placeholder="Supplier (required)"
              emptyMessage="No suppliers found"
            />
            <SearchableSelect
              options={locationOpts}
              value={receiveLocationId}
              onChange={setReceiveLocationId}
              placeholder="Location (required)"
              emptyMessage="No locations found"
            />
          </div>
        </article>

        {/* ── Tracking Input (if product has tracking profile) ── */}
        {receiveProduct?.trackingProfile && receiveProduct.trackingProfile.fields.length > 0 && (
          <article style={surfaceCardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>Tracking Information</h3>
            <p style={{ margin: '0 0 12px', color: 'var(--muted-foreground)', fontSize: 12 }}>
              Enter tracking values for each unit. Fields marked with * are required.
            </p>

            {/* Entry Mode Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {(['quick-scan', 'batch-paste', 'csv-upload'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setReceiveEntryMode(mode)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: receiveEntryMode === mode ? '#0f172a' : 'var(--muted)',
                    color: receiveEntryMode === mode ? '#fff' : 'var(--muted-foreground)',
                  }}
                >
                  {mode === 'quick-scan' ? 'Quick Scan' : mode === 'batch-paste' ? 'Batch Paste' : 'CSV Upload'}
                </button>
              ))}
            </div>

            {/* Entry Mode Content */}
            {receiveEntryMode === 'quick-scan' && (
              <QuickScanTab fields={receiveProduct.trackingProfile.fields} onAddUnit={addTrackingUnit} />
            )}
            {receiveEntryMode === 'batch-paste' && (
              <BatchPasteTab fields={receiveProduct.trackingProfile.fields} onAddUnits={addTrackingUnits} />
            )}
            {receiveEntryMode === 'csv-upload' && (
              <CsvUploadTab fields={receiveProduct.trackingProfile.fields} onAddUnits={addTrackingUnits} />
            )}
          </article>
        )}

        {/* ── Units List ── */}
        {receiveUnits.length > 0 && (
          <article style={surfaceCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Units to Receive ({receiveUnits.length})</h3>
              <button onClick={() => setReceiveUnits([])} style={{ ...subtleButtonStyle, fontSize: 11 }}>Clear All</button>
            </div>

            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...tableHeaderCellStyle, width: 40 }}>#</th>
                    {(receiveProduct?.trackingProfile?.fields || []).map((f) => (
                      <th key={f.id} style={tableHeaderCellStyle}>{f.fieldLabel}</th>
                    ))}
                    <th style={{ ...tableHeaderCellStyle, width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {receiveUnits.map((unit, idx) => (
                    <tr key={unit.id}>
                      <td style={tableCellStyle}>{idx + 1}</td>
                      {(receiveProduct?.trackingProfile?.fields || []).map((f) => (
                        <td key={f.id} style={tableCellStyle}>
                          <input
                            value={unit.values[f.fieldKey] || ''}
                            onChange={(e) => updateUnitField(unit.id, f.fieldKey, e.target.value)}
                            placeholder={f.fieldLabel}
                            style={{
                              ...fieldStyle,
                              width: '100%',
                              borderColor: unit.errors[f.fieldKey] ? '#dc2626' : undefined,
                            }}
                          />
                          {unit.errors[f.fieldKey] && (
                            <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>{unit.errors[f.fieldKey]}</div>
                          )}
                        </td>
                      ))}
                      <td style={tableCellStyle}>
                        <button onClick={() => removeUnit(unit.id)} style={{ ...dangerButtonStyle, fontSize: 11, padding: '4px 8px' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Receive Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                onClick={receiveStock}
                style={{ ...gray800ButtonStyle, minWidth: 200, minHeight: 40 }}
                disabled={receiveSaving || !receiveProductId || !receiveSupplierId || !receiveLocationId}
              >
                {receiveSaving ? 'Saving...' : `Receive ${receiveUnits.length} Unit(s) into Stock`}
              </button>
            </div>
          </article>
        )}

        {/* Print Labels Prompt */}
        {lastReceivedItems.length > 0 && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
            <span style={{ fontSize: 13, color: '#166534', flex: 1 }}>
              {lastReceivedItems.length} label(s) ready to print
            </span>
            <button
              onClick={() => void printReceivedLabels()}
              style={{ ...gray800ButtonStyle, fontSize: 12, padding: '6px 12px', minHeight: 'auto' }}
              disabled={printingLabels}
            >
              {printingLabels ? 'Printing...' : 'Print Labels'}
            </button>
            <button
              onClick={() => setLastReceivedItems([])}
              style={{ ...subtleButtonStyle, fontSize: 12, padding: '6px 12px', minHeight: 'auto' }}
            >
              Skip
            </button>
          </div>
        )}

        {/* ── Quick Add (for new products not in catalog) ── */}
        <QuickAddProduct onRefresh={refresh} setMessage={setMessage} />

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

// ── Quick Add (new product) ──

function QuickAddProduct({ onRefresh, setMessage }: { onRefresh: () => Promise<void>; setMessage: (m: string) => void }) {
  const compact = useCompactLayout();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [qty, setQty] = useState('1');
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; company_name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; code: string }>>([]);

  useEffect(() => {
    Promise.all([
      readJson<{ categories: Array<{ id: string; name: string }> }>('/api/catalog/categories?limit=200'),
      readJson<{ brands: Array<{ id: string; name: string }> }>('/api/catalog/brands?limit=200'),
      readJson<{ suppliers: Array<{ id: string; company_name: string }> }>('/api/store-ops/suppliers?limit=100'),
      readJson<{ locations: Array<{ id: string; name: string; code: string }> }>('/api/inventory/locations'),
    ]).then(([c, b, s, l]) => {
      setCategories(c.categories ?? []);
      setBrands(b.brands ?? []);
      setSuppliers(s.suppliers ?? []);
      setLocations(l.locations ?? []);
    }).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) { setMessage('Product name is required.'); return; }
    if (!supplierId || !locationId) { setMessage('Supplier and location are required.'); return; }
    setLoading(true);
    try {
      await readJson<any>('/api/store-ops/quick-receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: name.trim(),
          supplierId,
          locationId,
          categoryId: categoryId || undefined,
          brandId: brandId || undefined,
          salePrice: Number(price || 0) || 0,
          purchaseQty: Number(qty || 1),
          unitCost: Number(cost || 0),
          paidAmount: 0,
          hasVariants: false,
          variantLabels: undefined,
          isTrackable: true,
          note: '',
        }),
      });
      setMessage(`✓ Created "${name.trim()}" — stock received.`);
      toast.success('Product created and stock received');
      setName(''); setCategoryId(''); setBrandId(''); setPrice(''); setCost(''); setQty('1');
      await onRefresh();
    } catch (error) {
      const msg = (error as Error).message;
      setMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <article style={surfaceCardStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>Quick Add New Product</h3>
      <p style={{ margin: '0 0 12px', color: 'var(--muted-foreground)', fontSize: 12 }}>
        Create a simple product and receive stock in one step. Use the form above for products with tracking profiles.
      </p>

      <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...fieldStyle, marginBottom: 10, width: '100%' }} placeholder="Product name (required)" />

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={fieldStyle}>
          <option value="">No category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} style={fieldStyle}>
          <option value="">No brand</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={fieldStyle} placeholder="Quantity" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
        <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} style={fieldStyle} placeholder="Sale price (BDT)" />
        <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} style={fieldStyle} placeholder="Unit cost (BDT)" />
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={fieldStyle}>
          <option value="">Supplier (required)</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
        </select>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={fieldStyle}>
          <option value="">Location (required)</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <button onClick={handleCreate} style={{ ...gray800ButtonStyle, minWidth: 180, minHeight: 36 }} disabled={loading || !name.trim()}>
        {loading ? 'Saving...' : `Create & Receive (${qty} item${Number(qty) > 1 ? 's' : ''})`}
      </button>
    </article>
  );
}
