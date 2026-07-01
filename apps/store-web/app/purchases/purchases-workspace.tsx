'use client';

import { useEffect, useMemo, useState } from 'react';

import { ListPager, type PaginationState } from '../list-pager';
import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  secondaryButtonStyle,
  sectionPanelStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../marketone-theme';
import { stackedFilterGridStyle, useCompactLayout, WorkspaceTabs } from '../workspace-responsive';

type Supplier = {
  id: string;
  supplier_type: 'supplier' | 'importer' | 'company';
  company_name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  note?: string | null;
  opening_payable_amount?: string | number;
  total_payable_amount?: string | number;
  purchase_count?: number;
  status: 'active' | 'inactive';
};

type Purchase = {
  id: string;
  purchase_no: string;
  purchase_date: string;
  invoice_no?: string | null;
  total_amount: string | number;
  paid_amount: string | number;
  payment_status: string;
  status: string;
  supplier_name: string;
  location_name: string;
  item_count: number;
};

type PayableRow = {
  id: string;
  purchase_no: string;
  purchase_date: string;
  invoice_no?: string | null;
  total_amount: string | number;
  paid_amount: string | number;
  outstanding_amount: string | number;
  payment_status: string;
  supplier_name: string;
  supplier_phone?: string | null;
  aging_days: number;
};

type Aging = {
  today_amount: string | number;
  today_count: number;
  days_7_amount: string | number;
  days_7_count: number;
  days_30_amount: string | number;
  days_30_count: number;
  days_90_amount: string | number;
  days_90_count: number;
  days_90_plus_amount: string | number;
  days_90_plus_count: number;
};

type Location = {
  id: string;
  name: string;
  code: string;
};

type SkuResult = {
  id: string;
  sku_code: string;
  product_name: string;
  variant_label?: string | null;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

export function PurchasesWorkspace() {
  const compact = useCompactLayout();
  const [activeTab, setActiveTab] = useState<'overview' | 'purchases' | 'suppliers' | 'receive'>('overview');
  const [message, setMessage] = useState('Procurement workspace is ready.');
  const [loading, setLoading] = useState(false);

  const [supplierSearch, setSupplierSearch] = useState('');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [payableSearch, setPayableSearch] = useState('');
  const [purchaseStatus, setPurchaseStatus] = useState('');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [aging, setAging] = useState<Aging | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [skuResults, setSkuResults] = useState<SkuResult[]>([]);

  const [supplierPage, setSupplierPage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [payablePage, setPayablePage] = useState(1);
  const [supplierPagination, setSupplierPagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });
  const [purchasePagination, setPurchasePagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });
  const [payablePagination, setPayablePagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });

  const [supplierForm, setSupplierForm] = useState({
    supplierType: 'supplier',
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    note: '',
    openingPayableAmount: '0',
  });

  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: '',
    locationId: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    invoiceNo: '',
    discountAmount: '0',
    taxAmount: '0',
    shippingAmount: '0',
    note: '',
    paymentMethod: 'cash',
    paidAmount: '0',
    paymentReferenceNo: '',
    paymentNote: '',
  });

  const [skuSearch, setSkuSearch] = useState('');
  const [items, setItems] = useState<Array<{ skuId: string; label: string; qty: string; unitCost: string }>>([]);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});

  const refresh = async (
    nextSupplierPage = supplierPage,
    nextPurchasePage = purchasePage,
    nextPayablePage = payablePage,
  ) => {
    const supplierParams = new URLSearchParams({ page: String(nextSupplierPage), limit: String(supplierPagination.limit) });
    if (supplierSearch.trim()) supplierParams.set('search', supplierSearch.trim());
    const purchaseParams = new URLSearchParams({ page: String(nextPurchasePage), limit: String(purchasePagination.limit) });
    if (purchaseSearch.trim()) purchaseParams.set('search', purchaseSearch.trim());
    if (purchaseStatus) purchaseParams.set('status', purchaseStatus);
    const payableParams = new URLSearchParams({ page: String(nextPayablePage), limit: String(payablePagination.limit) });
    if (payableSearch.trim()) payableParams.set('search', payableSearch.trim());

    const [supplierPayload, purchasePayload, payablePayload, agingPayload, locationPayload] = await Promise.all([
      readJson<{ suppliers: Supplier[]; pagination?: PaginationState }>(`/api/store-ops/suppliers?${supplierParams.toString()}`),
      readJson<{ purchases: Purchase[]; pagination?: PaginationState }>(`/api/store-ops/purchases?${purchaseParams.toString()}`),
      readJson<{ payables: PayableRow[]; pagination?: PaginationState }>(`/api/store-ops/payables?${payableParams.toString()}`),
      readJson<{ aging: Aging }>('/api/store-ops/payables/aging'),
      readJson<{ locations: Location[] }>('/api/inventory/locations'),
    ]);

    setSuppliers(supplierPayload.suppliers ?? []);
    setPurchases(purchasePayload.purchases ?? []);
    setPayables(payablePayload.payables ?? []);
    setAging(agingPayload.aging ?? null);
    setLocations(locationPayload.locations ?? []);

    setSupplierPagination(supplierPayload.pagination ?? { page: nextSupplierPage, limit: supplierPagination.limit, total: supplierPayload.suppliers?.length ?? 0 });
    setPurchasePagination(purchasePayload.pagination ?? { page: nextPurchasePage, limit: purchasePagination.limit, total: purchasePayload.purchases?.length ?? 0 });
    setPayablePagination(payablePayload.pagination ?? { page: nextPayablePage, limit: payablePagination.limit, total: payablePayload.payables?.length ?? 0 });
    setSupplierPage(supplierPayload.pagination?.page ?? nextSupplierPage);
    setPurchasePage(purchasePayload.pagination?.page ?? nextPurchasePage);
    setPayablePage(payablePayload.pagination?.page ?? nextPayablePage);

    setPurchaseForm((current) => ({
      ...current,
      supplierId: current.supplierId || supplierPayload.suppliers?.[0]?.id || '',
      locationId: current.locationId || locationPayload.locations?.[0]?.id || '',
    }));
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const supplierOptions = useMemo(
    () => suppliers.filter((supplier) => supplier.status === 'active'),
    [suppliers],
  );

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitCost || 0), 0);
    const discountAmount = Number(purchaseForm.discountAmount || 0);
    const taxAmount = Number(purchaseForm.taxAmount || 0);
    const shippingAmount = Number(purchaseForm.shippingAmount || 0);
    const total = subtotal - discountAmount + taxAmount + shippingAmount;
    return {
      subtotal,
      total: Math.max(total, 0),
    };
  }, [items, purchaseForm.discountAmount, purchaseForm.taxAmount, purchaseForm.shippingAmount]);

  const searchSkus = async () => {
    if (!skuSearch.trim()) {
      setSkuResults([]);
      return;
    }
    setLoading(true);
    try {
      const payload = await readJson<{ skus: SkuResult[] }>(`/api/catalog/skus/search?q=${encodeURIComponent(skuSearch.trim())}&limit=20`);
      setSkuResults(payload.skus ?? []);
      setMessage(`Found ${payload.skus?.length ?? 0} SKU(s).`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const addSkuItem = (sku: SkuResult) => {
    setItems((current) => {
      if (current.some((item) => item.skuId === sku.id)) return current;
      return [
        ...current,
        {
          skuId: sku.id,
          label: `${sku.product_name} · ${sku.sku_code}${sku.variant_label ? ` · ${sku.variant_label}` : ''}`,
          qty: '1',
          unitCost: '0',
        },
      ];
    });
    setSkuSearch('');
    setSkuResults([]);
  };

  const createSupplier = async () => {
    if (!supplierForm.companyName.trim()) {
      setMessage('Supplier company name is required.');
      return;
    }
    setLoading(true);
    try {
      await readJson('/api/store-ops/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierType: supplierForm.supplierType,
          companyName: supplierForm.companyName.trim(),
          contactName: supplierForm.contactName.trim() || undefined,
          phone: supplierForm.phone.trim() || undefined,
          email: supplierForm.email.trim() || undefined,
          address: supplierForm.address.trim() || undefined,
          note: supplierForm.note.trim() || undefined,
          openingPayableAmount: Number(supplierForm.openingPayableAmount || 0),
          status: 'active',
        }),
      });
      setSupplierForm({
        supplierType: 'supplier',
        companyName: '',
        contactName: '',
        phone: '',
        email: '',
        address: '',
        note: '',
        openingPayableAmount: '0',
      });
      await refresh(1, purchasePage, payablePage);
      setMessage('Supplier created successfully.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const createPurchase = async () => {
    if (!purchaseForm.supplierId || !purchaseForm.locationId) {
      setMessage('Choose a supplier and inventory location first.');
      return;
    }
    if (!items.length) {
      setMessage('Add at least one SKU line to receive stock.');
      return;
    }
    const normalizedItems = items
      .map((item) => ({
        skuId: item.skuId,
        qty: Number(item.qty || 0),
        unitCost: Number(item.unitCost || 0),
      }))
      .filter((item) => item.qty > 0);
    if (!normalizedItems.length || normalizedItems.some((item) => item.unitCost < 0)) {
      setMessage('Each purchase line needs a positive quantity and a valid cost.');
      return;
    }

    setLoading(true);
    try {
      const payload = await readJson<{ purchaseNo: string; totalAmount: number; paymentStatus: string }>('/api/store-ops/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: purchaseForm.supplierId,
          locationId: purchaseForm.locationId,
          purchaseDate: purchaseForm.purchaseDate,
          invoiceNo: purchaseForm.invoiceNo.trim() || undefined,
          discountAmount: Number(purchaseForm.discountAmount || 0),
          taxAmount: Number(purchaseForm.taxAmount || 0),
          shippingAmount: Number(purchaseForm.shippingAmount || 0),
          note: purchaseForm.note.trim() || undefined,
          paymentMethod: purchaseForm.paymentMethod,
          paidAmount: Number(purchaseForm.paidAmount || 0),
          paymentReferenceNo: purchaseForm.paymentReferenceNo.trim() || undefined,
          paymentNote: purchaseForm.paymentNote.trim() || undefined,
          items: normalizedItems,
        }),
      });
      setItems([]);
      setPurchaseForm((current) => ({
        ...current,
        invoiceNo: '',
        discountAmount: '0',
        taxAmount: '0',
        shippingAmount: '0',
        note: '',
        paidAmount: '0',
        paymentReferenceNo: '',
        paymentNote: '',
      }));
      await refresh(supplierPage, 1, 1);
      setActiveTab('purchases');
      setMessage(`Purchase ${payload.purchaseNo} received successfully.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const addPayment = async (purchaseId: string) => {
    const amount = Number(paymentAmounts[purchaseId] || 0);
    if (!(amount > 0)) {
      setMessage('Enter a payment amount before posting supplier payment.');
      return;
    }
    setLoading(true);
    try {
      await readJson(`/api/store-ops/purchases/${purchaseId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentMethod: 'cash',
        }),
      });
      setPaymentAmounts((current) => ({ ...current, [purchaseId]: '' }));
      await refresh(supplierPage, purchasePage, payablePage);
      setMessage('Supplier payment recorded.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      {compact ? (
        <WorkspaceTabs
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'overview' | 'purchases' | 'suppliers' | 'receive')}
          tabs={[
            { key: 'overview', label: 'Payables' },
            { key: 'purchases', label: 'Purchases' },
            { key: 'suppliers', label: 'Suppliers' },
            { key: 'receive', label: 'Receive Stock' },
          ]}
        />
      ) : null}

      {(!compact || activeTab === 'overview') ? (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <MetricTile label="Today" amount={aging?.today_amount} count={aging?.today_count} />
            <MetricTile label="1-7 days" amount={aging?.days_7_amount} count={aging?.days_7_count} />
            <MetricTile label="8-30 days" amount={aging?.days_30_amount} count={aging?.days_30_count} />
            <MetricTile label="31-90 days" amount={aging?.days_90_amount} count={aging?.days_90_count} />
            <MetricTile label="90+ days" amount={aging?.days_90_plus_amount} count={aging?.days_90_plus_count} />
          </section>

          <article style={surfaceCardStyle}>
            <div style={{ ...stackedFilterGridStyle, marginBottom: 12 }}>
              <input value={payableSearch} onChange={(event) => setPayableSearch(event.target.value)} style={fieldStyle} placeholder="Search purchase no, invoice, supplier, or phone" />
              <button onClick={() => void refresh(supplierPage, purchasePage, 1)} style={secondaryButtonStyle} disabled={loading}>Search</button>
            </div>
            {payables.length ? (
              <>
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCellStyle}>Purchase</th>
                        <th style={tableHeaderCellStyle}>Supplier</th>
                        <th style={tableHeaderCellStyle}>Date</th>
                        <th style={tableHeaderCellStyle}>Outstanding</th>
                        <th style={tableHeaderCellStyle}>Aging</th>
                        <th style={tableHeaderCellStyle}>Quick payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payables.map((row) => (
                        <tr key={row.id}>
                          <td style={tableCellStyle}>
                            <div>{row.purchase_no}</div>
                            <div style={tokenMutedStyle}>{row.invoice_no || 'No invoice ref'}</div>
                          </td>
                          <td style={tableCellStyle}>
                            <div>{row.supplier_name}</div>
                            <div style={tokenMutedStyle}>{row.supplier_phone || '—'}</div>
                          </td>
                          <td style={tableCellStyle}>{row.purchase_date}</td>
                          <td style={tableCellStyle}>{formatMoney(row.outstanding_amount)}</td>
                          <td style={tableCellStyle}>{row.aging_days} day(s)</td>
                          <td style={tableCellStyle}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={paymentAmounts[row.id] ?? ''}
                                onChange={(event) => setPaymentAmounts((current) => ({ ...current, [row.id]: event.target.value }))}
                                style={{ ...fieldStyle, minWidth: 100 }}
                                placeholder="0.00"
                              />
                              <button onClick={() => void addPayment(row.id)} style={secondaryButtonStyle} disabled={loading}>Pay</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPager
                  page={payablePage}
                  pagination={payablePagination}
                  loading={loading}
                  label="payable(s)"
                  onPrevious={() => void refresh(supplierPage, purchasePage, Math.max(1, payablePage - 1))}
                  onNext={() => void refresh(supplierPage, purchasePage, payablePage + 1)}
                />
              </>
            ) : (
              <div style={emptyStateStyle}>No supplier payables yet. Receive a purchase first or add a supplier opening payable.</div>
            )}
          </article>
        </>
      ) : null}

      {(!compact || activeTab === 'purchases') ? (
        <article style={surfaceCardStyle}>
          <div style={{ ...stackedFilterGridStyle, marginBottom: 12 }}>
            <input value={purchaseSearch} onChange={(event) => setPurchaseSearch(event.target.value)} style={fieldStyle} placeholder="Search purchase no, invoice, or supplier" />
            <select value={purchaseStatus} onChange={(event) => setPurchaseStatus(event.target.value)} style={fieldStyle}>
              <option value="">All statuses</option>
              <option value="received">Received</option>
              <option value="draft">Draft</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button onClick={() => void refresh(supplierPage, 1, payablePage)} style={secondaryButtonStyle} disabled={loading}>Search</button>
          </div>
          {purchases.length ? (
            <>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Purchase</th>
                      <th style={tableHeaderCellStyle}>Supplier</th>
                      <th style={tableHeaderCellStyle}>Location</th>
                      <th style={tableHeaderCellStyle}>Items</th>
                      <th style={tableHeaderCellStyle}>Total</th>
                      <th style={tableHeaderCellStyle}>Paid</th>
                      <th style={tableHeaderCellStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td style={tableCellStyle}>
                          <div>{purchase.purchase_no}</div>
                          <div style={tokenMutedStyle}>{purchase.invoice_no || 'No invoice ref'}</div>
                        </td>
                        <td style={tableCellStyle}>{purchase.supplier_name}</td>
                        <td style={tableCellStyle}>{purchase.location_name}</td>
                        <td style={tableCellStyle}>{purchase.item_count}</td>
                        <td style={tableCellStyle}>{formatMoney(purchase.total_amount)}</td>
                        <td style={tableCellStyle}>{formatMoney(purchase.paid_amount)}</td>
                        <td style={tableCellStyle}>{purchase.payment_status} · {purchase.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPager
                page={purchasePage}
                pagination={purchasePagination}
                loading={loading}
                label="purchase(s)"
                onPrevious={() => void refresh(supplierPage, Math.max(1, purchasePage - 1), payablePage)}
                onNext={() => void refresh(supplierPage, purchasePage + 1, payablePage)}
              />
            </>
          ) : (
            <div style={emptyStateStyle}>No purchase records yet.</div>
          )}
        </article>
      ) : null}

      {(!compact || activeTab === 'suppliers') ? (
        <section style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.25fr) minmax(320px, 0.75fr)', gap: 16 }}>
          <article style={surfaceCardStyle}>
            <div style={{ ...stackedFilterGridStyle, marginBottom: 12 }}>
              <input value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} style={fieldStyle} placeholder="Search supplier name, contact, phone, or email" />
              <button onClick={() => void refresh(1, purchasePage, payablePage)} style={secondaryButtonStyle} disabled={loading}>Search</button>
            </div>
            {suppliers.length ? (
              <>
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCellStyle}>Supplier</th>
                        <th style={tableHeaderCellStyle}>Type</th>
                        <th style={tableHeaderCellStyle}>Contact</th>
                        <th style={tableHeaderCellStyle}>Opening</th>
                        <th style={tableHeaderCellStyle}>Outstanding</th>
                        <th style={tableHeaderCellStyle}>Purchases</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.map((supplier) => (
                        <tr key={supplier.id}>
                          <td style={tableCellStyle}>
                            <div>{supplier.company_name}</div>
                            <div style={tokenMutedStyle}>{supplier.address || 'No address'}</div>
                          </td>
                          <td style={tableCellStyle}>{supplier.supplier_type}</td>
                          <td style={tableCellStyle}>{supplier.contact_name || supplier.phone || supplier.email || '—'}</td>
                          <td style={tableCellStyle}>{formatMoney(supplier.opening_payable_amount)}</td>
                          <td style={tableCellStyle}>{formatMoney(supplier.total_payable_amount)}</td>
                          <td style={tableCellStyle}>{supplier.purchase_count ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPager
                  page={supplierPage}
                  pagination={supplierPagination}
                  loading={loading}
                  label="supplier(s)"
                  onPrevious={() => void refresh(Math.max(1, supplierPage - 1), purchasePage, payablePage)}
                  onNext={() => void refresh(supplierPage + 1, purchasePage, payablePage)}
                />
              </>
            ) : (
              <div style={emptyStateStyle}>No suppliers found yet.</div>
            )}
          </article>

          <article style={surfaceCardStyle}>
            <div style={{ ...sectionPanelStyle, padding: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Add supplier</div>
              <div style={stackedFilterGridStyle}>
                <select value={supplierForm.supplierType} onChange={(event) => setSupplierForm((current) => ({ ...current, supplierType: event.target.value }))} style={fieldStyle}>
                  <option value="supplier">Supplier</option>
                  <option value="importer">Importer</option>
                  <option value="company">Company</option>
                </select>
                <input value={supplierForm.companyName} onChange={(event) => setSupplierForm((current) => ({ ...current, companyName: event.target.value }))} style={fieldStyle} placeholder="Company name" />
                <input value={supplierForm.contactName} onChange={(event) => setSupplierForm((current) => ({ ...current, contactName: event.target.value }))} style={fieldStyle} placeholder="Contact name" />
                <input value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} style={fieldStyle} placeholder="Phone" />
                <input value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} style={fieldStyle} placeholder="Email" />
                <input value={supplierForm.openingPayableAmount} onChange={(event) => setSupplierForm((current) => ({ ...current, openingPayableAmount: event.target.value }))} style={fieldStyle} placeholder="Opening payable" />
                <input value={supplierForm.address} onChange={(event) => setSupplierForm((current) => ({ ...current, address: event.target.value }))} style={fieldStyle} placeholder="Address" />
                <input value={supplierForm.note} onChange={(event) => setSupplierForm((current) => ({ ...current, note: event.target.value }))} style={fieldStyle} placeholder="Note" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => void createSupplier()} style={accentButtonStyle} disabled={loading}>Create supplier</button>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {(!compact || activeTab === 'receive') ? (
        <section style={{ display: 'grid', gap: 16 }}>
          <article style={surfaceCardStyle}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Receive purchase stock</div>
            <div style={{ ...stackedFilterGridStyle, marginBottom: 12 }}>
              <select value={purchaseForm.supplierId} onChange={(event) => setPurchaseForm((current) => ({ ...current, supplierId: event.target.value }))} style={fieldStyle}>
                <option value="">Select supplier</option>
                {supplierOptions.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.company_name}</option>
                ))}
              </select>
              <select value={purchaseForm.locationId} onChange={(event) => setPurchaseForm((current) => ({ ...current, locationId: event.target.value }))} style={fieldStyle}>
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name} · {location.code}</option>
                ))}
              </select>
              <input type="date" value={purchaseForm.purchaseDate} onChange={(event) => setPurchaseForm((current) => ({ ...current, purchaseDate: event.target.value }))} style={fieldStyle} />
              <input value={purchaseForm.invoiceNo} onChange={(event) => setPurchaseForm((current) => ({ ...current, invoiceNo: event.target.value }))} style={fieldStyle} placeholder="Invoice no" />
            </div>

            <div style={{ ...stackedFilterGridStyle, marginBottom: 12 }}>
              <input value={skuSearch} onChange={(event) => setSkuSearch(event.target.value)} style={fieldStyle} placeholder="Search product or SKU to add purchase line" />
              <button onClick={() => void searchSkus()} style={secondaryButtonStyle} disabled={loading}>Search SKU</button>
            </div>

            {skuResults.length ? (
              <div style={{ ...tableWrapStyle, marginBottom: 12 }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Product</th>
                      <th style={tableHeaderCellStyle}>SKU</th>
                      <th style={tableHeaderCellStyle}>Variant</th>
                      <th style={tableHeaderCellStyle}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuResults.map((sku) => (
                      <tr key={sku.id}>
                        <td style={tableCellStyle}>{sku.product_name}</td>
                        <td style={tableCellStyle}>{sku.sku_code}</td>
                        <td style={tableCellStyle}>{sku.variant_label || '—'}</td>
                        <td style={tableCellStyle}>
                          <button onClick={() => addSkuItem(sku)} style={secondaryButtonStyle}>Add line</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {items.length ? (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>SKU line</th>
                      <th style={tableHeaderCellStyle}>Qty</th>
                      <th style={tableHeaderCellStyle}>Unit cost</th>
                      <th style={tableHeaderCellStyle}>Line total</th>
                      <th style={tableHeaderCellStyle}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.skuId}>
                        <td style={tableCellStyle}>{item.label}</td>
                        <td style={tableCellStyle}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={item.qty}
                            onChange={(event) => setItems((current) => current.map((entry) => entry.skuId === item.skuId ? { ...entry, qty: event.target.value } : entry))}
                            style={fieldStyle}
                          />
                        </td>
                        <td style={tableCellStyle}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitCost}
                            onChange={(event) => setItems((current) => current.map((entry) => entry.skuId === item.skuId ? { ...entry, unitCost: event.target.value } : entry))}
                            style={fieldStyle}
                          />
                        </td>
                        <td style={tableCellStyle}>{formatMoney(Number(item.qty || 0) * Number(item.unitCost || 0))}</td>
                        <td style={tableCellStyle}>
                          <button onClick={() => setItems((current) => current.filter((entry) => entry.skuId !== item.skuId))} style={secondaryButtonStyle}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={emptyStateStyle}>Search and add at least one SKU line to receive purchase stock.</div>
            )}

            <div style={{ ...stackedFilterGridStyle, marginTop: 12 }}>
              <input type="number" min="0" step="0.01" value={purchaseForm.discountAmount} onChange={(event) => setPurchaseForm((current) => ({ ...current, discountAmount: event.target.value }))} style={fieldStyle} placeholder="Discount" />
              <input type="number" min="0" step="0.01" value={purchaseForm.taxAmount} onChange={(event) => setPurchaseForm((current) => ({ ...current, taxAmount: event.target.value }))} style={fieldStyle} placeholder="Tax" />
              <input type="number" min="0" step="0.01" value={purchaseForm.shippingAmount} onChange={(event) => setPurchaseForm((current) => ({ ...current, shippingAmount: event.target.value }))} style={fieldStyle} placeholder="Shipping" />
              <input type="number" min="0" step="0.01" value={purchaseForm.paidAmount} onChange={(event) => setPurchaseForm((current) => ({ ...current, paidAmount: event.target.value }))} style={fieldStyle} placeholder="Paid now" />
              <select value={purchaseForm.paymentMethod} onChange={(event) => setPurchaseForm((current) => ({ ...current, paymentMethod: event.target.value }))} style={fieldStyle}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mfs">MFS</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
              <input value={purchaseForm.paymentReferenceNo} onChange={(event) => setPurchaseForm((current) => ({ ...current, paymentReferenceNo: event.target.value }))} style={fieldStyle} placeholder="Payment reference" />
              <input value={purchaseForm.note} onChange={(event) => setPurchaseForm((current) => ({ ...current, note: event.target.value }))} style={fieldStyle} placeholder="Purchase note" />
              <input value={purchaseForm.paymentNote} onChange={(event) => setPurchaseForm((current) => ({ ...current, paymentNote: event.target.value }))} style={fieldStyle} placeholder="Payment note" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <div style={tokenMutedStyle}>
                Subtotal {formatMoney(totals.subtotal)} · Total {formatMoney(totals.total)}
              </div>
              <button onClick={() => void createPurchase()} style={accentButtonStyle} disabled={loading}>Receive purchase</button>
            </div>
          </article>
        </section>
      ) : null}

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}

function MetricTile({
  label,
  amount,
  count,
}: {
  label: string;
  amount: string | number | null | undefined;
  count: number | null | undefined;
}) {
  return (
    <article style={surfaceCardStyle}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{formatMoney(amount)}</div>
      <div style={{ color: '#64748b' }}>{count ?? 0} payable(s)</div>
    </article>
  );
}
