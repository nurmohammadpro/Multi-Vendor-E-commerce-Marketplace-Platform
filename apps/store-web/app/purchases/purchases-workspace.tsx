'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Package, Truck, Users, FileText } from 'lucide-react';

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
import { useCompactLayout, WorkspaceTabs } from '../workspace-responsive';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/searchable-select';
import { printProductLabelBatch } from '../../lib/print-agent';
import { loadWorkstationProfile } from '../../lib/workstation-profile';
import { QuickScanTab } from './quick-scan-tab';
import { BatchPasteTab } from './batch-paste-tab';
import { CsvUploadTab } from './csv-upload-tab';
import type { TrackingField } from './tracking-input';

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
      if (typeof err.message === 'string') message = err.message;
      else if (Array.isArray(err.message) && err.message.length > 0) message = err.message[0];
      else if (typeof err.error === 'string') message = err.error;
    }
    throw new Error(message);
  }
  return payload as T;
}

export function PurchasesWorkspace() {
  const compact = useCompactLayout();
  const [activeTab, setActiveTab] = useState('purchases');
  const [message, setMessage] = useState('Purchases & stock management.');
  const [loading, setLoading] = useState(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchasePagination, setPurchasePagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseStatus, setPurchaseStatus] = useState('');

  // ── Receive form state ──
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [receiveProductId, setReceiveProductId] = useState('');
  const [receiveProduct, setReceiveProduct] = useState<ProductWithProfile | null>(null);
  const [receiveProductSearch, setReceiveProductSearch] = useState('');
  const [receiveProductResults, setReceiveProductResults] = useState<ProductWithProfile[]>([]);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const [receiveUnits, setReceiveUnits] = useState<ReceiveUnit[]>([]);
  const [receiveSkuId, setReceiveSkuId] = useState('');
  const [receiveSupplierId, setReceiveSupplierId] = useState('');
  const [receiveLocationId, setReceiveLocationId] = useState('');
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [receiveEntryMode, setReceiveEntryMode] = useState<'quick-scan' | 'batch-paste' | 'csv-upload'>('quick-scan');
  const [receiveQty, setReceiveQty] = useState('1');
  const [receiveUnitCost, setReceiveUnitCost] = useState('');
  const [receiveSellPrice, setReceiveSellPrice] = useState('');

  // Quick Add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickCategoryId, setQuickCategoryId] = useState('');
  const [quickBrandId, setQuickBrandId] = useState('');
  const [quickSupplierId, setQuickSupplierId] = useState('');
  const [quickLocationId, setQuickLocationId] = useState('');
  const [quickPrice, setQuickPrice] = useState('');
  const [quickCost, setQuickCost] = useState('');
  const [quickQty, setQuickQty] = useState('1');
  const [quickSaving, setQuickSaving] = useState(false);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);

  // Last received items for print labels
  const [lastReceivedItems, setLastReceivedItems] = useState<Array<{ sku: string; productName: string; sellingPrice?: number | null }>>([]);
  const [printingLabels, setPrintingLabels] = useState(false);

  const supplierOpts = useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.company_name, indent: false })), [suppliers]);
  const locationOpts = useMemo(() => locations.map((l) => ({ value: l.id, label: `${l.name} · ${l.code}`, indent: false })), [locations]);

  // ── Data loading ──

  const refresh = async (pp = purchasePage) => {
    setLoading(true);
    try {
      const [supplierPayload, purchasePayload, locationPayload] = await Promise.all([
        readJson<{ suppliers: Supplier[] }>('/api/store-ops/suppliers?limit=100'),
        readJson<{ purchases: Purchase[]; pagination?: PaginationState }>(`/api/store-ops/purchases?page=${pp}&limit=10&search=${encodeURIComponent(purchaseSearch)}&status=${purchaseStatus}`),
        readJson<{ locations: Location[] }>('/api/inventory/locations'),
      ]);
      setSuppliers(supplierPayload.suppliers ?? []);
      setPurchases(purchasePayload.purchases ?? []);
      setPurchasePagination(purchasePayload.pagination ?? { page: 1, limit: 10, total: 0 });
      setLocations(locationPayload.locations ?? []);
      if (!receiveLocationId && locationPayload.locations?.[0]) {
        setReceiveLocationId(locationPayload.locations[0].id);
      }
      setMessage('Purchases ready.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  };

  const refreshCatalog = async () => {
    try {
      const [catRes, brandRes] = await Promise.all([
        readJson<{ categories: Array<{ id: string; name: string }> }>('/api/catalog/categories?limit=200'),
        readJson<{ brands: Array<{ id: string; name: string }> }>('/api/catalog/brands?limit=200'),
      ]);
      setCategories(catRes.categories ?? []);
      setBrands(brandRes.brands ?? []);
    } catch { /* ignore */ }
  };

  useEffect(() => { void refresh(); }, []);

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

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedProductIndex(0);
  }, [receiveProductResults]);

  // Auto-generate tracking units when quantity changes for tracked products
  useEffect(() => {
    if (!receiveProduct || !receiveProduct.trackingProfile || receiveProduct.trackingProfile.fields.length === 0) {
      return;
    }
    const qty = Number(receiveQty) || 0;
    if (qty <= 0) {
      setReceiveUnits([]);
      return;
    }
    // Only regenerate if the number of units doesn't match the quantity
    if (receiveUnits.length !== qty) {
      const fields = receiveProduct.trackingProfile.fields;
      const newUnits: ReceiveUnit[] = [];
      // Preserve existing units if possible, otherwise create new ones
      for (let i = 0; i < qty; i++) {
        const existingUnit = receiveUnits[i];
        if (existingUnit) {
          newUnits.push(existingUnit);
        } else {
          // Create new unit with empty tracking values
          const values: Record<string, string> = {};
          const errors: Record<string, string> = {};
          for (const f of fields) {
            values[f.fieldKey] = '';
            if (f.isRequired) {
              errors[f.fieldKey] = `${f.fieldLabel} is required`;
            }
          }
          newUnits.push({
            id: `auto-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            values,
            errors
          });
        }
      }
      setReceiveUnits(newUnits);
    }
  }, [receiveQty, receiveProduct]);

  const selectReceiveProduct = async (product: ProductWithProfile) => {
    setReceiveProductId(product.id);
    setReceiveProductSearch(product.name);
    setShowProductSuggestions(false);
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
      setReceiveQty('1');
      // Auto-populate cost and sell price from catalog
      const defaultSku = res.skus?.[0];
      if (defaultSku?.cost_price) setReceiveUnitCost(String(defaultSku.cost_price));
      if (defaultSku?.sale_price) setReceiveSellPrice(String(defaultSku.sale_price));
    } catch { /* ignore */ }
  };

  // ── Tracking Unit Management ──

  const addTrackingUnit = (values: Record<string, string>) => {
    const fields = receiveProduct?.trackingProfile?.fields || [];
    const errors: Record<string, string> = {};
    for (const f of fields) {
      if (f.isRequired && !values[f.fieldKey]?.trim()) errors[f.fieldKey] = `${f.fieldLabel} is required`;
      if (f.isUnique && values[f.fieldKey]?.trim()) {
        const dup = receiveUnits.find((u) => u.values[f.fieldKey]?.trim() === values[f.fieldKey]?.trim());
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
        if (f.isRequired && !values[f.fieldKey]?.trim()) errors[f.fieldKey] = `${f.fieldLabel} is required`;
      }
      return { id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, values, errors };
    });
    setReceiveUnits((prev) => [...prev, ...newUnits]);
  };

  const removeUnit = (unitId: string) => setReceiveUnits((prev) => prev.filter((u) => u.id !== unitId));

  const updateUnitField = (unitId: string, key: string, value: string) => {
    setReceiveUnits((prev) => prev.map((u) => {
      if (u.id !== unitId) return u;
      const newValues = { ...u.values, [key]: value };
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

    const qty = Number(receiveQty);
    if (!qty || qty < 1) { setMessage('Enter a valid quantity.'); return; }

    const hasTracking = receiveProduct?.trackingProfile && receiveProduct.trackingProfile.fields.length > 0;

    if (hasTracking) {
      const fields = receiveProduct?.trackingProfile?.fields || [];
      let hasErrors = false;
      const validatedUnits = receiveUnits.map((unit) => {
        const errors: Record<string, string> = {};
        for (const f of fields) {
          if (f.isRequired && !unit.values[f.fieldKey]?.trim()) { errors[f.fieldKey] = `${f.fieldLabel} is required`; hasErrors = true; }
        }
        return { ...unit, errors };
      });
      setReceiveUnits(validatedUnits);
      if (hasErrors) { setMessage('Fix the errors below.'); return; }
    }

    setReceiveSaving(true);
    try {
      const body: Record<string, any> = {
        productId: receiveProductId,
        skuId: receiveSkuId || undefined,
        supplierId: receiveSupplierId,
        locationId: receiveLocationId,
        qty,
        unitCost: receiveUnitCost ? Number(receiveUnitCost) : undefined
      };
      if (hasTracking) {
        body.trackingValuesList = receiveUnits.map((u) => u.values);
      }
      const res = await readJson<any>('/api/store-ops/purchases/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const receivedItems: Array<{ sku: string; productName: string; sellingPrice?: number | null }> = [];
      if (res?.sku) receivedItems.push({ sku: res.sku.barcode || res.sku.skuCode || res.sku.id, productName: res.product?.name || receiveProduct?.name || '', sellingPrice: res.sku.salePrice || null });
      setLastReceivedItems(receivedItems);
      setMessage(`✓ Received ${qty} unit(s) for "${receiveProduct?.name}". ${res?.purchase?.purchaseNo ? `Purchase ${res.purchase.purchaseNo}.` : ''}`);
      toast.success(`Received ${qty} unit(s)`);
      resetReceiveForm();
      await refresh();
    } catch (error) {
      const msg = (error as Error).message;
      setMessage(msg);
      toast.error(msg);
    } finally { setReceiveSaving(false); }
  };

  const resetReceiveForm = () => {
    setReceiveUnits([]);
    setReceiveProductId('');
    setReceiveProduct(null);
    setReceiveProductSearch('');
    setReceiveSkuId('');
    setReceiveSupplierId('');
    setReceiveQty('1');
    setReceiveUnitCost('');
    setReceiveSellPrice('');
    setHighlightedProductIndex(0);
    setShowProductSuggestions(false);
  };

  // ── Quick Add Submit ──

  const quickAddSubmit = async () => {
    if (!quickName.trim()) { setMessage('Product name is required.'); return; }
    if (!quickSupplierId || !quickLocationId) { setMessage('Supplier and location are required.'); return; }
    setQuickSaving(true);
    try {
      await readJson<any>('/api/store-ops/quick-receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: quickName.trim(), supplierId: quickSupplierId, locationId: quickLocationId,
          categoryId: quickCategoryId || undefined, brandId: quickBrandId || undefined,
          salePrice: Number(quickPrice || 0) || 0, purchaseQty: Number(quickQty || 1), unitCost: Number(quickCost || 0),
          paidAmount: 0, hasVariants: false, isTrackable: true, note: '',
        }),
      });
      setMessage(`✓ Created "${quickName.trim()}" — stock received.`);
      toast.success('Product created and stock received');
      setQuickName(''); setQuickCategoryId(''); setQuickBrandId(''); setQuickPrice(''); setQuickCost(''); setQuickQty('1');
      setShowQuickAdd(false);
      await refresh();
    } catch (error) {
      const msg = (error as Error).message;
      setMessage(msg);
      toast.error(msg);
    } finally { setQuickSaving(false); }
  };

  // ── Print Labels ──

  const printReceivedLabels = async () => {
    if (!lastReceivedItems.length) return;
    setPrintingLabels(true);
    try {
      const profile = loadWorkstationProfile();
      await printProductLabelBatch({
        items: lastReceivedItems.map((item) => ({ sku: item.sku, productName: item.productName, storeName: 'Store', sellingPrice: item.sellingPrice })),
        printerName: profile.labelPrinterName || undefined, widthMm: 40, heightMm: 25, barcodeType: '128', border: true,
      }, profile.agentUrl);
      toast.success(`Printed ${lastReceivedItems.length} label(s)`);
      setLastReceivedItems([]);
      setMessage('Labels printed successfully.');
    } catch (error) { toast.error((error as Error).message); }
    finally { setPrintingLabels(false); }
  };

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      {/* ── Tab Navigation ── */}
      <WorkspaceTabs
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: 'purchases', label: 'Purchases & Receive' },
          { key: 'suppliers', label: 'Supplier Management' },
          { key: 'payables', label: 'Payables & Ledger' },
        ]}
      />

      {/* ── Tab Content ── */}
      {activeTab === 'purchases' && (
        <>
          {/* ── Purchases Header ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>{message}</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => { setShowQuickAdd(!showQuickAdd); if (!showQuickAdd) refreshCatalog(); }}
                style={{ ...secondaryButtonStyle, fontSize: 12, padding: '6px 12px', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Package style={{ width: 13, height: 13 }} />
                Quick Add
              </button>
              <button
                onClick={() => setShowReceiveForm(!showReceiveForm)}
                style={{ ...gray800ButtonStyle, fontSize: 12, padding: '6px 14px', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                Receive Stock
                {showReceiveForm ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
              </button>
            </div>
          </div>

      {/* ═══════════════ Receive Stock Form (inline) ═══════════════ */}
      {showReceiveForm && (
        <section style={{ display: 'grid', gap: 12 }}>
          {/* Product Selection */}
          <article style={{ ...surfaceCardStyle, border: '2px solid var(--primary)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 2, fontSize: 14 }}>Receive Stock</h3>
                <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 11 }}>Search product → enter units → receive into inventory.</p>
              </div>
              <button onClick={() => { setShowReceiveForm(false); resetReceiveForm(); }} style={{ ...subtleButtonStyle, fontSize: 11 }}>Close</button>
            </div>

            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                value={receiveProductSearch}
                onChange={(e) => { setReceiveProductSearch(e.target.value); setShowProductSuggestions(true); }}
                onFocus={() => { if (receiveProductResults.length > 0) setShowProductSuggestions(true); }}
                onBlur={() => setTimeout(() => setShowProductSuggestions(false), 200)}
                onKeyDown={(e) => {
                  if (!showProductSuggestions || receiveProductResults.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightedProductIndex((prev) => Math.min(prev + 1, receiveProductResults.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedProductIndex((prev) => Math.max(prev - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const selected = receiveProductResults[highlightedProductIndex];
                    if (selected) selectReceiveProduct(selected);
                  } else if (e.key === 'Escape') {
                    setShowProductSuggestions(false);
                  }
                }}
                style={{ ...fieldStyle, width: '100%' }}
                placeholder="Search product name or code..."
              />
              {showProductSuggestions && receiveProductResults.length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 50, marginTop: 4, background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxHeight: 240, overflowY: 'auto' }}>
                  {receiveProductResults.map((p, idx) => (
                    <div
                      key={p.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectReceiveProduct(p)}
                      onMouseEnter={() => setHighlightedProductIndex(idx)}
                      ref={(el) => { if (idx === highlightedProductIndex && el) el.scrollIntoView({ block: 'nearest' }); }}
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: idx === highlightedProductIndex ? 'var(--accent)' : 'transparent',
                        color: idx === highlightedProductIndex ? 'var(--accent-foreground)' : 'inherit',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>{p.product_code}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {receiveProduct && (
              <div style={{ background: 'var(--muted)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{receiveProduct.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 4 }}>{receiveProduct.product_code}</span>
                  </div>
                  {receiveProduct.trackingProfile && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent)', padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                      {receiveProduct.trackingProfile.name}
                      <span style={{ marginLeft: 4, background: 'var(--accent)', borderRadius: 4, padding: '0 4px', fontSize: 10 }}>{receiveProduct.trackingProfile.fields.length} fields</span>
                    </span>
                  )}
                  {receiveProduct.skus && receiveProduct.skus.length > 1 && (
                    <select value={receiveSkuId} onChange={(e) => setReceiveSkuId(e.target.value)} style={{ ...fieldStyle, fontSize: 12, padding: '4px 8px', height: 'auto' }}>
                      <option value="">Default SKU</option>
                      {receiveProduct.skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.sku_code}{sku.variant_label ? ` · ${sku.variant_label}` : ''}</option>)}
                    </select>
                  )}
                  <button onClick={() => { setReceiveProduct(null); setReceiveProductId(''); setReceiveProductSearch(''); setReceiveUnits([]); setReceiveUnitCost(''); setReceiveSellPrice(''); }} style={{ ...subtleButtonStyle, fontSize: 11, marginLeft: 'auto' }}>Change</button>
                </div>
                {/* Show catalog prices */}
                <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                  {receiveProduct.skus && receiveProduct.skus.length > 0 && (
                    <>
                      {(() => {
                        const selectedSku = receiveProduct.skus.find(s => s.id === receiveSkuId) || receiveProduct.skus[0];
                        return (
                          <>
                            {selectedSku.cost_price && (
                              <span style={{ color: 'var(--muted-foreground)' }}>
                                Catalog Cost: <strong>{formatMoney(selectedSku.cost_price)}</strong>
                              </span>
                            )}
                            {selectedSku.sale_price && (
                              <span style={{ color: 'var(--muted-foreground)' }}>
                                Catalog Sell: <strong>{formatMoney(selectedSku.sale_price)}</strong>
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Supplier, Location, Quantity, Unit Cost, Sell Price in one line */}
            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '2fr 2fr 1fr 1fr 1fr', gap: 8, alignItems: compact ? 'stretch' : 'end' }}>
              <SearchableSelect options={supplierOpts} value={receiveSupplierId} onChange={setReceiveSupplierId} placeholder="Supplier (required)" emptyMessage="No suppliers found" />
              <SearchableSelect options={locationOpts} value={receiveLocationId} onChange={setReceiveLocationId} placeholder="Location (required)" emptyMessage="No locations found" />
              {receiveProduct && (
                <>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4, display: 'block' }}>Quantity</label>
                    <input type="number" min="1" max="100" value={receiveQty} onChange={(e) => setReceiveQty(e.target.value)} style={{ ...fieldStyle, width: '100%', fontSize: 12 }} placeholder="Qty" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4, display: 'block' }}>Unit Cost</label>
                    <input type="number" min="0" step="0.01" value={receiveUnitCost} onChange={(e) => setReceiveUnitCost(e.target.value)} style={{ ...fieldStyle, width: '100%', fontSize: 12 }} placeholder="Cost" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4, display: 'block' }}>Sell Price</label>
                    <input type="number" min="0" step="0.01" value={receiveSellPrice} onChange={(e) => setReceiveSellPrice(e.target.value)} style={{ ...fieldStyle, width: '100%', fontSize: 12 }} placeholder="Price" />
                  </div>
                </>
              )}
            </div>
          </article>

          {/* Tracking & Units - merged section */}
          {receiveProduct?.trackingProfile && receiveProduct.trackingProfile.fields.length > 0 && (
            <article style={surfaceCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <h3 style={{ margin: 0, marginBottom: 4, fontSize: 14 }}>Tracking Information & Units</h3>
                  <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 11 }}>Enter tracking values for each unit. Fields marked with * are required.</p>
                </div>
                {receiveUnits.length > 0 && (
                  <button onClick={() => setReceiveUnits([])} style={{ ...subtleButtonStyle, fontSize: 11 }}>Clear All</button>
                )}
              </div>

              {/* Entry mode tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {(['quick-scan', 'batch-paste', 'csv-upload'] as const).map((mode) => (
                  <button key={mode} onClick={() => setReceiveEntryMode(mode)} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer', background: receiveEntryMode === mode ? 'var(--primary)' : 'var(--muted)', color: receiveEntryMode === mode ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
                    {mode === 'quick-scan' ? 'Quick Scan' : mode === 'batch-paste' ? 'Batch Paste' : 'CSV Upload'}
                  </button>
                ))}
              </div>

              {/* Entry input area */}
              {receiveEntryMode === 'quick-scan' && <QuickScanTab fields={receiveProduct.trackingProfile.fields} onAddUnit={addTrackingUnit} />}
              {receiveEntryMode === 'batch-paste' && <BatchPasteTab fields={receiveProduct.trackingProfile.fields} onAddUnits={addTrackingUnits} />}
              {receiveEntryMode === 'csv-upload' && <CsvUploadTab fields={receiveProduct.trackingProfile.fields} onAddUnits={addTrackingUnits} />}

              {/* Units table */}
              {receiveUnits.length > 0 && (
                <>
                  <h4 style={{ margin: '10px 0 6px', fontSize: 13, fontWeight: 600 }}>Units to Receive ({receiveUnits.length})</h4>
                  <div style={tableWrapStyle}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={{ ...tableHeaderCellStyle, width: 36 }}>#</th>
                          {(receiveProduct?.trackingProfile?.fields || []).map((f) => <th key={f.id} style={tableHeaderCellStyle}>{f.fieldLabel}</th>)}
                          <th style={{ ...tableHeaderCellStyle, width: 36 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {receiveUnits.map((unit, idx) => (
                          <tr key={unit.id}>
                            <td style={tableCellStyle}>{idx + 1}</td>
                            {(receiveProduct?.trackingProfile?.fields || []).map((f) => (
                              <td key={f.id} style={tableCellStyle}>
                                <input value={unit.values[f.fieldKey] || ''} onChange={(e) => updateUnitField(unit.id, f.fieldKey, e.target.value)} style={{ ...fieldStyle, fontSize: 12, borderColor: unit.errors[f.fieldKey] ? 'var(--destructive)' : undefined }} placeholder={f.fieldLabel} />
                                {unit.errors[f.fieldKey] && <div style={{ fontSize: 10, color: 'var(--destructive)', marginTop: 2 }}>{unit.errors[f.fieldKey]}</div>}
                              </td>
                            ))}
                            <td style={tableCellStyle}><button onClick={() => removeUnit(unit.id)} style={{ ...subtleButtonStyle, color: 'var(--destructive)', fontSize: 11, padding: '2px 6px' }}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Receive button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 10, borderTop: receiveUnits.length > 0 ? '1px solid var(--border)' : 'none' }}>
                <button onClick={receiveStock} style={{ ...gray800ButtonStyle, minWidth: 180, minHeight: 36 }} disabled={receiveSaving || !receiveProductId || !receiveSupplierId || !receiveLocationId}>
                  {receiveSaving ? 'Saving...' : (() => {
                    const hasTracking = receiveProduct?.trackingProfile && receiveProduct.trackingProfile.fields.length > 0;
                    const count = hasTracking ? receiveUnits.length : Number(receiveQty) || 0;
                    return `Receive ${count} Unit(s) into Stock`;
                  })()}
                </button>
              </div>
            </article>
          )}

          {/* Print Labels Prompt */}
          {lastReceivedItems.length > 0 && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--success-soft, #f0fdf4)', border: '1px solid var(--success-border, #bbf7d0)', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--success-text, #166534)', flex: 1 }}>{lastReceivedItems.length} label(s) ready to print</span>
              <button onClick={() => void printReceivedLabels()} style={{ ...gray800ButtonStyle, fontSize: 11, padding: '5px 10px', minHeight: 'auto' }} disabled={printingLabels}>{printingLabels ? 'Printing...' : 'Print Labels'}</button>
              <button onClick={() => setLastReceivedItems([])} style={{ ...subtleButtonStyle, fontSize: 11, padding: '5px 10px', minHeight: 'auto' }}>Skip</button>
            </div>
          )}
        </section>
      )}

      {/* ═══════════════ Quick Add Form (inline) ═══════════════ */}
      {showQuickAdd && (
        <article style={{ ...surfaceCardStyle, border: '1px solid var(--border)', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 2, fontSize: 14 }}>Quick Add New Product</h3>
              <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 11 }}>Create a simple product and receive stock in one step.</p>
            </div>
            <button onClick={() => setShowQuickAdd(false)} style={{ ...subtleButtonStyle, fontSize: 11 }}>Close</button>
          </div>
          <input value={quickName} onChange={(e) => setQuickName(e.target.value)} style={{ ...fieldStyle, marginBottom: 8, width: '100%' }} placeholder="Product name (required)" />
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
            <select value={quickCategoryId} onChange={(e) => setQuickCategoryId(e.target.value)} style={{ ...fieldStyle, fontSize: 12 }}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={quickBrandId} onChange={(e) => setQuickBrandId(e.target.value)} style={{ ...fieldStyle, fontSize: 12 }}>
              <option value="">No brand</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input type="number" min="1" value={quickQty} onChange={(e) => setQuickQty(e.target.value)} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Quantity" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
            <input type="number" min="0" step="0.01" value={quickPrice} onChange={(e) => setQuickPrice(e.target.value)} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Sale price (BDT)" />
            <input type="number" min="0" step="0.01" value={quickCost} onChange={(e) => setQuickCost(e.target.value)} style={{ ...fieldStyle, fontSize: 12 }} placeholder="Unit cost (BDT)" />
            <select value={quickSupplierId} onChange={(e) => setQuickSupplierId(e.target.value)} style={{ ...fieldStyle, fontSize: 12 }}>
              <option value="">Supplier (required)</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>
            <select value={quickLocationId} onChange={(e) => setQuickLocationId(e.target.value)} style={{ ...fieldStyle, fontSize: 12 }}>
              <option value="">Location (required)</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <button onClick={quickAddSubmit} style={{ ...gray800ButtonStyle, fontSize: 12, padding: '6px 14px', minHeight: 'auto' }} disabled={quickSaving || !quickName.trim()}>
            {quickSaving ? 'Saving...' : `Create & Receive (${quickQty} item${Number(quickQty) > 1 ? 's' : ''})`}
          </button>
        </article>
      )}

      {/* ═══════════════ Non-Tracked Product Receive Button ═══════════════ */}
      {receiveProduct && (!receiveProduct.trackingProfile || receiveProduct.trackingProfile.fields.length === 0) && (
        <article style={surfaceCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
              Ready to receive {Number(receiveQty) || 1} unit(s)
            </span>
            <button onClick={receiveStock} style={{ ...gray800ButtonStyle, minWidth: 180, minHeight: 36 }} disabled={receiveSaving || !receiveProductId || !receiveSupplierId || !receiveLocationId}>
              {receiveSaving ? 'Saving...' : `Receive ${Number(receiveQty) || 1} Unit(s) into Stock`}
            </button>
          </div>
        </article>
      )}

      {/* ═══════════════ Purchase History ═══════════════ */}
      <article style={surfaceCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Purchase History</h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={purchaseSearch} onChange={(e) => setPurchaseSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void refresh(1)} style={{ ...fieldStyle, fontSize: 12, width: 200 }} placeholder="Search purchase no, supplier..." />
            <select value={purchaseStatus} onChange={(e) => setPurchaseStatus(e.target.value)} style={{ ...fieldStyle, fontSize: 12, width: 120 }}>
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="confirmed">Confirmed</option>
              <option value="partially_received">Partially Received</option>
              <option value="fully_received">Fully Received</option>
              <option value="received">Received (Legacy)</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button onClick={() => { setPurchasePage(1); void refresh(1); }} style={{ ...searchButtonStyle, fontSize: 11, padding: '5px 10px', minHeight: 'auto' }} disabled={loading}>Search</button>
          </div>
        </div>
        {purchases.length ? (
          <>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Purchase No</th>
                    <th style={tableHeaderCellStyle}>Date</th>
                    <th style={tableHeaderCellStyle}>Supplier</th>
                    <th style={tableHeaderCellStyle}>Location</th>
                    <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Total</th>
                    <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Paid</th>
                    <th style={tableHeaderCellStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id}>
                      <td style={tableCellStyle}><div style={{ fontWeight: 600, fontSize: 13 }}>{p.purchase_no}</div></td>
                      <td style={{ ...tableCellStyle, fontSize: 12 }}>{p.purchase_date}</td>
                      <td style={{ ...tableCellStyle, fontSize: 12 }}>{p.supplier_name}</td>
                      <td style={{ ...tableCellStyle, fontSize: 12 }}>{p.location_name}</td>
                      <td style={{ ...tableCellStyle, textAlign: 'right', fontSize: 12 }}>{formatMoney(p.total_amount)}</td>
                      <td style={{ ...tableCellStyle, textAlign: 'right', fontSize: 12 }}>{formatMoney(p.paid_amount)}</td>
                      <td style={tableCellStyle}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500, background: p.payment_status === 'paid' ? 'var(--success-soft, #dcfce7)' : p.payment_status === 'unpaid' ? 'var(--destructive-soft, #fee2e2)' : 'var(--warning-soft, #fef3c7)', color: p.payment_status === 'paid' ? 'var(--success-text, #166534)' : p.payment_status === 'unpaid' ? 'var(--destructive-text, #991b1b)' : 'var(--warning-text, #92400e)' }}>
                          {p.payment_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPager page={purchasePagination.page} pagination={purchasePagination} label="purchases"
              onNext={() => { const np = purchasePage + 1; setPurchasePage(np); void refresh(np); }}
              onPrevious={() => { const np = Math.max(1, purchasePage - 1); setPurchasePage(np); void refresh(np); }}
            />
          </>
        ) : <div style={emptyStateStyle}>No purchases found. Click "Receive Stock" to get started.</div>}
      </article>
        </>
      )}

      {activeTab === 'suppliers' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>Supplier management and payable tracking.</p>
            <button
              onClick={() => { /* TODO: Add supplier form */ }}
              style={{ ...gray800ButtonStyle, fontSize: 12, padding: '6px 14px', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Add Supplier
            </button>
          </div>

          {/* Suppliers List */}
          <article style={surfaceCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>Suppliers</h3>
            </div>
            {suppliers.length > 0 ? (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Company Name</th>
                      <th style={tableHeaderCellStyle}>Contact Name</th>
                      <th style={tableHeaderCellStyle}>Phone</th>
                      <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Current Payable</th>
                      <th style={{ ...tableHeaderCellStyle, width: 80 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((supplier) => (
                      <tr key={supplier.id}>
                        <td style={tableCellStyle}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{supplier.company_name}</div>
                        </td>
                        <td style={{ ...tableCellStyle, fontSize: 12 }}>{supplier.contact_name || '-'}</td>
                        <td style={{ ...tableCellStyle, fontSize: 12 }}>{supplier.phone || '-'}</td>
                        <td style={{ ...tableCellStyle, textAlign: 'right', fontSize: 12 }}>
                          {formatMoney(supplier.current_payable_amount || 0)}
                        </td>
                        <td style={tableCellStyle}>
                          <button
                            onClick={() => { /* TODO: Edit supplier */ }}
                            style={{ ...subtleButtonStyle, fontSize: 11, padding: '2px 6px' }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={emptyStateStyle}>No suppliers found. Add your first supplier to get started.</div>
            )}
          </article>
        </>
      )}

      {activeTab === 'payables' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>Payables aging and ledger management.</p>
          </div>

          {/* Payables Summary */}
          <article style={surfaceCardStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14 }}>Payables Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div style={{ padding: 12, background: 'var(--muted)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4 }}>Today</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>0 BDT</div>
              </div>
              <div style={{ padding: 12, background: 'var(--muted)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4 }}>0-7 Days</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>0 BDT</div>
              </div>
              <div style={{ padding: 12, background: 'var(--muted)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4 }}>8-30 Days</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>0 BDT</div>
              </div>
              <div style={{ padding: 12, background: 'var(--muted)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4 }}>31-90 Days</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>0 BDT</div>
              </div>
              <div style={{ padding: 12, background: 'var(--muted)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4 }}>90+ Days</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>0 BDT</div>
              </div>
            </div>
          </article>

          {/* Outstanding Payables */}
          <article style={surfaceCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>Outstanding Payables</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  placeholder="Search supplier..."
                  style={{ ...fieldStyle, fontSize: 12, width: 200 }}
                />
                <button style={{ ...searchButtonStyle, fontSize: 11, padding: '5px 10px', minHeight: 'auto' }}>
                  Search
                </button>
              </div>
            </div>
            <div style={emptyStateStyle}>
              No outstanding payables found. Payables will appear here when you make purchases on credit.
            </div>
          </article>

          {/* Ledger */}
          <article style={surfaceCardStyle}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14 }}>Supplier Ledger</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select style={{ ...fieldStyle, fontSize: 12 }}>
                <option value="">All Suppliers</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
              </select>
              <input type="date" style={{ ...fieldStyle, fontSize: 12 }} placeholder="From date" />
              <input type="date" style={{ ...fieldStyle, fontSize: 12 }} placeholder="To date" />
              <button style={{ ...searchButtonStyle, fontSize: 11, padding: '5px 10px', minHeight: 'auto' }}>
                Generate
              </button>
            </div>
            <div style={emptyStateStyle}>
              Select a supplier and date range to generate ledger report.
            </div>
          </article>
        </>
      )}
    </section>
  );
}
