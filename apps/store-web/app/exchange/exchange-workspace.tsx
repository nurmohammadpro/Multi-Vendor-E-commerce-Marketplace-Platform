'use client';

import { useMemo, useState } from 'react';

import {
  dangerButtonStyle,
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
import { searchRowStyle, WorkspaceTabs } from '../workspace-responsive';
import { SerialPickerModal } from '../pos/serial-picker-modal';
import { openInvoicePrintWindow } from '../../lib/print-agent';

type LookupSaleItem = {
  saleItemId: string;
  skuId: string;
  productName: string;
  skuCode: string;
  variantLabel?: string | null;
  requiresSerial: boolean;
  qty: number;
  remainingQty: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  credit: number;
  serials: Array<{ id: string; serialNumber: string; imeiNumber?: string | null }>;
};

type LookupSale = {
  saleId: string;
  saleNo: string;
  invoiceNo?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  totalAmount: number;
  paidAmount: number;
  paidRatio: number;
  paymentStatus: string;
  soldAt: string;
  items: LookupSaleItem[];
};

type SkuSearchResult = {
  id: string;
  sku_code: string;
  product_name: string;
  variant_label?: string | null;
  is_trackable?: boolean;
  sale_price?: string | number | null;
  available_qty?: string | number | null;
  unit_name?: string | null;
};

type NewItemRow = {
  key: string;
  skuId: string;
  skuCode: string;
  productName: string;
  variantLabel?: string | null;
  qty: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  serialIds: string[];
  serialNumbers: string[];
  isTrackable: boolean;
};

type TenderRow = { paymentMethod: string; amount: string; referenceNo: string };

type ExchangeReceipt = {
  type: 'exchange';
  exchangeId: string;
  exchangeNo: string;
  originalSaleId: string;
  originalSaleNo: string;
  status: string;
  processedAt: string;
  processedByName?: string | null;
  locationName?: string | null;
  store: {
    name?: string | null;
    logoUrl?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    footer?: string | null;
  };
  customer: {
    name?: string | null;
    phone?: string | null;
    shopName?: string | null;
  };
  tradeInItems: Array<{
    productName: string;
    skuCode: string;
    serialNumber?: string | null;
    imeiNumber?: string | null;
    qty: number;
    lineCredit: number;
    restock: boolean;
  }>;
  newItems: Array<{
    productName: string;
    skuCode: string;
    serialNumber?: string | null;
    imeiNumber?: string | null;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  paymentSummary: {
    tenders: Array<{ paymentMethod: string | null; amount: number; referenceNo?: string | null }>;
    totalPaid: number;
    tradeInCredit: number;
    newItemsTotal: number;
    exchangeAmount: number;
    exchangeAmountLabel: string;
    refund: { method: string | null; reference: string | null; amount: number } | null;
  };
  stockNotes: string[];
  note?: string | null;
  amountInWords?: string | null;
  printedAt: string;
};

type ExchangeListRow = {
  id: string;
  exchange_no: string;
  original_sale_no: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  trade_in_credit: number;
  new_items_total: number;
  difference: number;
  refund_method?: string | null;
  status: string;
  created_at: string;
  items_summary?: string;
};

type ExchangeDetail = {
  exchange: {
    id: string;
    exchange_no: string;
    original_sale_no?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    trade_in_credit: number;
    new_items_total: number;
    difference: number;
    refund_method?: string | null;
    refund_reference?: string | null;
    note?: string | null;
    status: string;
    created_at: string;
    processed_by_name?: string | null;
    location_name?: string | null;
  };
  items: Array<{
    id: string;
    side: 'returned' | 'new';
    product_name_snapshot: string;
    sku_code_snapshot: string;
    serial_number?: string | null;
    imei_number?: string | null;
    qty: number;
    unit_price: number;
    line_total: number;
    line_credit: number;
    restock: boolean;
  }>;
};

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'mfs', label: 'Mobile Banking' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

const REFUND_METHOD_OPTIONS = PAYMENT_METHOD_OPTIONS;

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message)
        ? ((payload as any).error || (payload as any).message)
        : `Request failed with ${response.status}`,
    );
  }
  return payload as T;
}

const formatMoney = (v: number) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const round2 = (v: number) => Math.round(v * 100) / 100;

export function ExchangeWorkspace() {
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // ── New exchange: lookup ──
  const [lookupValue, setLookupValue] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupSales, setLookupSales] = useState<LookupSale[]>([]);
  const [selectedSale, setSelectedSale] = useState<LookupSale | null>(null);

  // ── New exchange: returned side ──
  const [returnedRows, setReturnedRows] = useState<Record<string, { qty: number; restock: boolean; serialIds: string[] }>>({});

  // ── New exchange: new items side ──
  const [newItems, setNewItems] = useState<NewItemRow[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<SkuSearchResult[]>([]);
  const [productLoading, setProductLoading] = useState(false);

  // ── Serial picker ──
  const [serialPicker, setSerialPicker] = useState<{
    kind: 'returned' | 'new';
    key: string;
    skuId: string;
    skuCode: string;
    productName: string;
    needed: number;
  } | null>(null);

  // ── Settlement ──
  const [tenders, setTenders] = useState<TenderRow[]>([]);
  const [refundMethod, setRefundMethod] = useState('');
  const [refundReference, setRefundReference] = useState('');
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);

  // ── Success / receipt ──
  const [receipt, setReceipt] = useState<ExchangeReceipt | null>(null);
  const [success, setSuccess] = useState(false);

  // ── History ──
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyRows, setHistoryRows] = useState<ExchangeListRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const historyLimit = 15;
  const [detail, setDetail] = useState<ExchangeDetail | null>(null);

  // ── Derived totals ──
  const tradeInCredit = useMemo(() => {
    if (!selectedSale) return 0;
    return round2(
      selectedSale.items.reduce((sum, item) => {
        const row = returnedRows[item.saleItemId];
        if (!row || row.qty <= 0 || item.remainingQty <= 0) return sum;
        const unitCredit = item.qty > 0 ? item.credit / item.qty : 0;
        return sum + unitCredit * row.qty;
      }, 0),
    );
  }, [selectedSale, returnedRows]);

  const newItemsTotal = useMemo(
    () =>
      round2(
        newItems.reduce((sum, item) => {
          if (item.qty <= 0) return sum;
          if (item.isTrackable && item.serialIds.length !== item.qty) return sum;
          return sum + item.qty * item.unitPrice - item.discountAmount + item.taxAmount;
        }, 0),
      ),
    [newItems],
  );

  const difference = round2(newItemsTotal - tradeInCredit);
  const tendersSum = round2(tenders.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0));
  const needsPayment = difference > 0.009;
  const needsRefund = difference < -0.009;
  const paymentsComplete = !needsPayment || Math.abs(tendersSum - difference) < 0.01;
  const refundComplete = !needsRefund || (Boolean(refundMethod) && (refundMethod === 'cash' || refundReference.trim().length > 0));

  const returnedSelectionValid = useMemo(() => {
    if (!selectedSale) return false;
    const rows = Object.entries(returnedRows).filter(([, r]) => r.qty > 0);
    if (rows.length === 0) return false;
    for (const [saleItemId, row] of rows) {
      const item = selectedSale.items.find((i) => i.saleItemId === saleItemId);
      if (!item) return false;
      if (row.qty > item.remainingQty) return false;
      if (item.requiresSerial && row.serialIds.length !== row.qty) return false;
    }
    return true;
  }, [selectedSale, returnedRows]);

  const newItemsValid = useMemo(() => {
    if (newItems.length === 0) return false;
    return newItems.every((item) => {
      if (item.qty <= 0) return false;
      if (item.discountAmount < 0 || item.taxAmount < 0) return false;
      if (item.isTrackable && item.serialIds.length !== item.qty) return false;
      return true;
    });
  }, [newItems]);

  // ── Lookup flow ──
  const runLookup = async () => {
    const value = lookupValue.trim();
    if (!value) {
      setError('Enter a phone number, sale number, or invoice number.');
      return;
    }
    setLookupLoading(true);
    setError('');
    setLookupSales([]);
    setSelectedSale(null);
    try {
      const params = new URLSearchParams();
      params.set('phone', value);
      params.set('saleNo', value);
      params.set('invoice', value);
      const data = await readJson<{ sales: LookupSale[] }>(`/api/pos/exchanges/lookup?${params.toString()}`);
      setLookupSales(data.sales ?? []);
      if ((data.sales ?? []).length === 0) {
        setError('No eligible sales found for this search.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };

  const selectSale = (sale: LookupSale) => {
    setSelectedSale(sale);
    const initial: Record<string, { qty: number; restock: boolean; serialIds: string[] }> = {};
    for (const item of sale.items) {
      if (item.remainingQty > 0) {
        initial[item.saleItemId] = { qty: 0, restock: true, serialIds: [] };
      }
    }
    setReturnedRows(initial);
    setNewItems([]);
    setTenders([]);
    setRefundMethod('');
    setRefundReference('');
    setNote('');
    setSuccess(false);
    setReceipt(null);
    setError('');
  };

  const updateReturnedRow = (saleItemId: string, patch: Partial<{ qty: number; restock: boolean; serialIds: string[] }>) => {
    setReturnedRows((prev) => ({
      ...prev,
      [saleItemId]: { ...prev[saleItemId], ...patch },
    }));
  };

  // ── Product search / new items ──
  const searchProducts = async () => {
    const q = productQuery.trim();
    if (!q) return;
    setProductLoading(true);
    setError('');
    try {
      const data = await readJson<{ skus: SkuSearchResult[] }>(`/api/pos/search?q=${encodeURIComponent(q)}&limit=20`);
      setProductResults(data.skus ?? []);
      if ((data.skus ?? []).length === 0) setError('No products found matching your search.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Product search failed');
    } finally {
      setProductLoading(false);
    }
  };

  const addProductRow = (sku: SkuSearchResult) => {
    const available = Number(sku.available_qty ?? 0);
    if (available <= 0) {
      setError(`${sku.product_name} is out of stock.`);
      return;
    }
    const row: NewItemRow = {
      key: `${sku.id}-${Date.now()}`,
      skuId: sku.id,
      skuCode: sku.sku_code,
      productName: sku.product_name,
      variantLabel: sku.variant_label ?? null,
      qty: 1,
      unitPrice: Number(sku.sale_price ?? 0),
      discountAmount: 0,
      taxAmount: 0,
      serialIds: [],
      serialNumbers: [],
      isTrackable: Boolean(sku.is_trackable),
    };
    setNewItems((prev) => [...prev, row]);
    setError('');
    if (row.isTrackable) {
      setSerialPicker({
        kind: 'new',
        key: row.key,
        skuId: row.skuId,
        skuCode: row.skuCode,
        productName: row.productName,
        needed: row.qty,
      });
    }
  };

  const updateNewItemRow = (key: string, patch: Partial<NewItemRow>) => {
    setNewItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const removeNewItemRow = (key: string) => {
    setNewItems((prev) => prev.filter((item) => item.key !== key));
  };

  // ── Serial picking ──
  const handleSerialSelect = (serials: Array<{ serialId: string; serialNumber: string; imei?: string | null }>) => {
    if (!serialPicker) return;
    const ids = serials.map((s) => s.serialId);
    const numbers = serials.map((s) => s.serialNumber);
    if (serialPicker.kind === 'returned') {
      updateReturnedRow(serialPicker.key, { serialIds: ids });
    } else {
      updateNewItemRow(serialPicker.key, { serialIds: ids, serialNumbers: numbers });
    }
    setSerialPicker(null);
  };

  // ── Tenders ──
  const addTender = () => {
    const remaining = round2(difference - tendersSum);
    setTenders((prev) => [...prev, { paymentMethod: 'cash', amount: remaining > 0 ? String(remaining) : '', referenceNo: '' }]);
  };
  const updateTender = (index: number, patch: Partial<TenderRow>) => {
    setTenders((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };
  const removeTender = (index: number) => {
    setTenders((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Submit ──
  const submitExchange = async () => {
    if (!selectedSale) return;
    if (!returnedSelectionValid) {
      setError('Select quantities to return (with serials where required) — quantities cannot exceed the remaining returnable qty.');
      return;
    }
    if (!newItemsValid) {
      setError('Add at least one new item with a valid price and complete serial selection.');
      return;
    }
    if (needsPayment && !paymentsComplete) {
      setError(`Payment amounts must total exactly ${formatMoney(difference)} (currently ${formatMoney(tendersSum)}).`);
      return;
    }
    if (!refundComplete) {
      setError('Refund method is required (reference required unless cash).');
      return;
    }

    const returnedItems = Object.entries(returnedRows)
      .filter(([saleItemId, row]) => {
        if (row.qty <= 0) return false;
        const item = selectedSale.items.find((i) => i.saleItemId === saleItemId);
        return Boolean(item) && row.qty <= (item?.remainingQty ?? 0);
      })
      .map(([saleItemId, row]) => ({
        saleItemId,
        qty: row.qty,
        restock: row.restock,
        serialIds: row.serialIds.length > 0 ? row.serialIds : undefined,
      }));

    const payloadNewItems = newItems.map((item) => ({
      skuId: item.skuId,
      qty: item.qty,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      taxAmount: item.taxAmount,
      serialIds: item.serialIds.length > 0 ? item.serialIds : undefined,
    }));

    setProcessing(true);
    setError('');
    try {
      const data = await readJson<{ exchange: { id: string; exchangeNo: string; difference: number }; exchangeReceipt: ExchangeReceipt }>(
        '/api/pos/exchanges',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalSaleId: selectedSale.saleId,
            note: note.trim() || undefined,
            returnedItems,
            newItems: payloadNewItems,
            payments: needsPayment
              ? tenders.map((t) => ({ paymentMethod: t.paymentMethod, amount: parseFloat(t.amount) || 0, referenceNo: t.referenceNo.trim() || undefined }))
              : [],
            refundMethod: needsRefund ? refundMethod : undefined,
            refundReference: needsRefund && refundReference.trim() ? refundReference.trim() : undefined,
          }),
        },
      );
      setReceipt(data.exchangeReceipt ?? null);
      setSuccess(true);
      setMessage(
        data.exchange.difference >= 0
          ? `Exchange ${data.exchange.exchangeNo} completed. Customer pays ${formatMoney(data.exchange.difference)}.`
          : `Exchange ${data.exchange.exchangeNo} completed. Refund due ${formatMoney(Math.abs(data.exchange.difference))}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Exchange failed');
    } finally {
      setProcessing(false);
    }
  };

  const resetFlow = () => {
    setSelectedSale(null);
    setLookupSales([]);
    setLookupValue('');
    setReturnedRows({});
    setNewItems([]);
    setProductQuery('');
    setProductResults([]);
    setTenders([]);
    setRefundMethod('');
    setRefundReference('');
    setNote('');
    setSuccess(false);
    setReceipt(null);
    setMessage('');
    setError('');
  };

  // ── History ──
  const loadHistory = async (p = 1) => {
    setHistoryLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(historyLimit) });
      const q = historyQuery.trim();
      if (q) params.set('query', q);
      const data = await readJson<{ exchanges: ExchangeListRow[]; pagination: { total: number } }>(`/api/pos/exchanges?${params}`);
      setHistoryRows(data.exchanges ?? []);
      setHistoryPage(p);
      setHistoryTotal(data.pagination?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exchanges');
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openDetail = async (exchangeId: string) => {
    setError('');
    try {
      const data = await readJson<ExchangeDetail>(`/api/pos/exchanges/${exchangeId}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exchange');
    }
  };

  // ── Print mapping ──
  const buildExchangePrintPayload = (r: ExchangeReceipt) => ({
    saleId: r.originalSaleId,
    saleNo: r.exchangeNo,
    saleType: 'exchange' as const,
    paymentStatus: r.paymentSummary.exchangeAmount >= 0 ? 'paid' : 'refunded',
    note: r.note ?? `Exchange on sale ${r.originalSaleNo}`,
    store: r.store,
    customer: r.customer,
    preparedBy: r.processedByName || undefined,
    amountInWords: r.amountInWords || null,
    items: [
      ...r.newItems.map((ni) => ({
        name: ni.productName,
        skuCode: ni.skuCode,
        qty: ni.qty,
        unitPrice: ni.unitPrice,
        discountAmount: 0,
        lineTotal: ni.lineTotal,
      })),
      ...r.tradeInItems.map((ti) => ({
        name: `Trade-in: ${ti.productName}`,
        skuCode: ti.skuCode,
        qty: ti.qty,
        unitPrice: 0,
        discountAmount: 0,
        lineTotal: -ti.lineCredit,
        isExchangeItem: true,
      })),
    ],
    totals: {
      subtotal: r.paymentSummary.newItemsTotal,
      discount: 0,
      vat: 0,
      tax: 0,
      shipping: 0,
      total: r.paymentSummary.exchangeAmount,
      paid: r.paymentSummary.totalPaid,
      due: 0,
      change: 0,
    },
    payments: r.paymentSummary.tenders.map((t) => ({
      paymentMethod: t.paymentMethod,
      amount: t.amount,
      referenceNo: t.referenceNo ?? null,
    })),
    exchange: {
      productName: r.tradeInItems.map((t) => t.productName).join(', ') || null,
      skuCode: r.tradeInItems.map((t) => t.skuCode).join(', ') || null,
      amount: r.paymentSummary.exchangeAmount,
    },
    printedAt: r.printedAt,
  });

  const handlePrint = (r: ExchangeReceipt) => {
    openInvoicePrintWindow(buildExchangePrintPayload(r) as any);
  };

  const handleReprint = async (exchangeId: string) => {
    try {
      const data = await readJson<{ receipt: ExchangeReceipt }>(`/api/pos/exchanges/${exchangeId}/reprint`, { method: 'POST' });
      if (data.receipt) handlePrint(data.receipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reprint failed');
    }
  };

  // ── Receipt view (after successful exchange) ──
  if (tab === 'new' && success && receipt) {
    const ps = receipt.paymentSummary;
    return (
      <div style={pageShellStyle}>
        <div style={{ background: '#d1fae5', color: '#065f46', padding: '16px 20px', borderRadius: 6, marginBottom: 10, fontSize: 14 }}>
          <strong>Exchange completed successfully.</strong> {message}
        </div>

        <article style={{ ...surfaceCardStyle, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, paddingBottom: 12, borderBottom: '2px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{receipt.store?.name || 'Store'}</div>
              {receipt.store?.phone && <div style={{ ...tokenMutedStyle, fontSize: 12 }}>{receipt.store.phone}</div>}
              {receipt.store?.address && <div style={{ ...tokenMutedStyle, fontSize: 12 }}>{receipt.store.address}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: 2 }}>Exchange Receipt</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{receipt.exchangeNo}</div>
              <div style={{ ...tokenMutedStyle, fontSize: 11 }}>
                Original sale {receipt.originalSaleNo} · {new Date(receipt.processedAt).toLocaleString('en-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 2 }}>Customer</div>
              <div style={{ fontWeight: 600 }}>{receipt.customer?.name || 'Walk-in'}</div>
              {receipt.customer?.phone && <div style={{ ...tokenMutedStyle, fontSize: 12 }}>{receipt.customer.phone}</div>}
            </div>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 2 }}>Processed By</div>
              <div style={{ fontWeight: 600 }}>{receipt.processedByName || '—'}</div>
              {receipt.locationName && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Location: {receipt.locationName}</div>}
            </div>
          </div>

          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 6 }}>Trade-in (Returned) Items</div>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Item</th>
                  <th style={tableHeaderCellStyle}>Serial / IMEI</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'center' }}>Qty</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Credit</th>
                  <th style={tableHeaderCellStyle}>Restock</th>
                </tr>
              </thead>
              <tbody>
                {receipt.tradeInItems.map((ti, idx) => (
                  <tr key={idx}>
                    <td style={tableCellStyle}>
                      {ti.productName}
                      <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{ti.skuCode}</div>
                    </td>
                    <td style={{ ...tableCellStyle, ...tokenMutedStyle, fontSize: 12 }}>
                      {ti.serialNumber || ti.imeiNumber || '—'}
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: 'center' }}>{ti.qty}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>+{formatMoney(ti.lineCredit)}</td>
                    <td style={tableCellStyle}>{ti.restock ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 6, marginTop: 12 }}>New Items</div>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Item</th>
                  <th style={tableHeaderCellStyle}>Serial / IMEI</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'center' }}>Qty</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Unit Price</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {receipt.newItems.map((ni, idx) => (
                  <tr key={idx}>
                    <td style={tableCellStyle}>
                      {ni.productName}
                      <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{ni.skuCode}</div>
                    </td>
                    <td style={{ ...tableCellStyle, ...tokenMutedStyle, fontSize: 12 }}>
                      {ni.serialNumber || ni.imeiNumber || '—'}
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: 'center' }}>{ni.qty}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>{formatMoney(ni.unitPrice)}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 600 }}>{formatMoney(ni.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--muted)', borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: '#64748b' }}>New Items Total</span>
              <span>{formatMoney(ps.newItemsTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: '#64748b' }}>Trade-in Credit</span>
              <span>-{formatMoney(ps.tradeInCredit)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '2px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
              <span style={{ color: ps.exchangeAmount >= 0 ? '#b45309' : '#dc2626' }}>
                {ps.exchangeAmount >= 0 ? 'Customer Pays' : 'Refund Due'}
              </span>
              <span style={{ color: ps.exchangeAmount >= 0 ? '#b45309' : '#dc2626' }}>
                {formatMoney(Math.abs(ps.exchangeAmount))}
              </span>
            </div>
            {ps.tenders.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                {ps.tenders.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t.paymentMethod}{t.referenceNo ? ` (${t.referenceNo})` : ''}</span>
                    <span>{formatMoney(t.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {ps.refund && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>
                Refund via {ps.refund.method}{ps.refund.reference ? ` · Ref: ${ps.refund.reference}` : ''}
              </div>
            )}
          </div>

          {receipt.stockNotes.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
              {receipt.stockNotes.map((sn, i) => (
                <div key={i}>• {sn}</div>
              ))}
            </div>
          )}
          {receipt.amountInWords && (
            <div style={{ marginTop: 8, fontSize: 12, fontStyle: 'italic', color: '#64748b' }}>{receipt.amountInWords}</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={() => handlePrint(receipt)} style={gray800ButtonStyle}>
              Print Exchange Receipt
            </button>
            <button onClick={resetFlow} style={secondaryButtonStyle}>
              New Exchange
            </button>
          </div>
        </article>
      </div>
    );
  }

  // ── Exchange builder view ──
  if (tab === 'new' && selectedSale) {
    return (
      <div style={pageShellStyle}>
        
        <button onClick={() => { setSelectedSale(null); setError(''); }} style={{ ...secondaryButtonStyle, marginBottom: 10 }}>
          &larr; Back to Lookup
        </button>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '6px 10px', borderRadius: 6, marginBottom: 12, fontSize: 14 }}>
            {error}
          </div>
        )}

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>Sale {selectedSale.saleNo}</h3>
          <p style={{ ...tokenMutedStyle, margin: 0 }}>
            {selectedSale.customerName || 'Walk-in'}
            {selectedSale.customerPhone ? ` · ${selectedSale.customerPhone}` : ''}
            {' · '}Total: {formatMoney(selectedSale.totalAmount)}
            {' · '}Paid: {formatMoney(selectedSale.paidAmount)}
            {' · '}Paid ratio: {Math.round(selectedSale.paidRatio * 100)}%
          </p>
        </article>

        <div style={{ fontSize: 13, fontWeight: 600, margin: '16px 0 6px' }}>1. Items Being Returned (Trade-in)</div>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>Item</th>
                <th style={tableHeaderCellStyle}>Return Qty</th>
                <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Credit</th>
                <th style={tableHeaderCellStyle}>Serial</th>
                <th style={tableHeaderCellStyle}>Restock</th>
              </tr>
            </thead>
            <tbody>
              {selectedSale.items.filter((item) => item.remainingQty > 0).map((item) => {
                const row = returnedRows[item.saleItemId];
                if (!row) return null;
                const unitCredit = item.qty > 0 ? item.credit / item.qty : 0;
                const rowCredit = round2(unitCredit * row.qty);
                const serialDone = !item.requiresSerial || row.serialIds.length === row.qty;
                return (
                  <tr key={item.saleItemId}>
                    <td style={tableCellStyle}>
                      {item.productName}
                      {item.variantLabel ? <span style={tokenMutedStyle}> {'·'} {item.variantLabel}</span> : null}
                      <div style={{ ...tokenMutedStyle, fontSize: 11 }}>
                        {item.skuCode} · Sold {item.qty} · Returnable {item.remainingQty}
                      </div>
                    </td>
                    <td style={tableCellStyle}>
                      <input
                        type="number"
                        min={0}
                        max={item.remainingQty}
                        value={row.qty}
                        onChange={(e) => {
                          const qty = Math.max(0, Math.min(item.remainingQty, parseInt(e.target.value) || 0));
                          updateReturnedRow(item.saleItemId, {
                            qty,
                            serialIds: row.serialIds.slice(0, qty),
                          });
                        }}
                        style={{ ...fieldStyle, width: 72 }}
                      />
                      <span style={{ ...tokenMutedStyle, marginLeft: 4, fontSize: 12 }}>/ {item.remainingQty}</span>
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>+{formatMoney(rowCredit)}</td>
                    <td style={tableCellStyle}>
                      {item.requiresSerial ? (
                        <>
                          <button
                            onClick={() =>
                              setSerialPicker({
                                kind: 'returned',
                                key: item.saleItemId,
                                skuId: item.skuId,
                                skuCode: item.skuCode,
                                productName: item.productName,
                                needed: row.qty,
                              })
                            }
                            style={{ ...gray800ButtonStyle, fontSize: 12 }}
                            disabled={row.qty <= 0}
                          >
                            {row.serialIds.length > 0
                              ? `${row.serialIds.length}/${row.qty} picked`
                              : `Pick ${row.qty}`}
                          </button>
                          {!serialDone && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }}>Required</div>}
                        </>
                      ) : (
                        <span style={tokenMutedStyle}>—</span>
                      )}
                    </td>
                    <td style={tableCellStyle}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={row.restock}
                          onChange={(e) => updateReturnedRow(item.saleItemId, { restock: e.target.checked })}
                        />
                        <span style={{ fontSize: 13 }}>Restock</span>
                      </label>
                    </td>
                  </tr>
                );
              })}
              {selectedSale.items.every((item) => item.remainingQty <= 0) && (
                <tr>
                  <td colSpan={5} style={tableCellStyle}>
                    <div style={emptyStateStyle}>Nothing left to return on this sale.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 6px' }}>2. New Items</div>
        <div style={{ ...searchRowStyle, marginBottom: 8 }}>
          <input
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchProducts(); } }}
            style={{ ...fieldStyle, flex: 1, width: 'auto' }}
            placeholder="Search products to exchange into"
          />
          <button onClick={() => void searchProducts()} style={searchButtonStyle} disabled={productLoading}>
            {productLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
        {productResults.length > 0 && (
          <div style={{ ...tableWrapStyle, marginBottom: 12 }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Product</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Price</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Available</th>
                  <th style={tableHeaderCellStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {productResults.map((sku) => (
                  <tr key={sku.id}>
                    <td style={tableCellStyle}>
                      {sku.product_name}
                      {sku.variant_label ? <span style={tokenMutedStyle}> {'·'} {sku.variant_label}</span> : null}
                      <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{sku.sku_code}</div>
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>{formatMoney(Number(sku.sale_price ?? 0))}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>{Number(sku.available_qty ?? 0)}</td>
                    <td style={tableCellStyle}>
                      <button onClick={() => addProductRow(sku)} style={gray800ButtonStyle} disabled={Number(sku.available_qty ?? 0) <= 0}>
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {newItems.length > 0 && (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Item</th>
                  <th style={tableHeaderCellStyle}>Qty</th>
                  <th style={tableHeaderCellStyle}>Unit Price</th>
                  <th style={tableHeaderCellStyle}>Discount</th>
                  <th style={tableHeaderCellStyle}>Tax</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Line Total</th>
                  <th style={tableHeaderCellStyle}></th>
                </tr>
              </thead>
              <tbody>
                {newItems.map((item) => {
                  const serialDone = !item.isTrackable || item.serialIds.length === item.qty;
                  return (
                    <tr key={item.key} style={serialDone ? undefined : { background: 'rgba(239,68,68,0.05)' }}>
                      <td style={tableCellStyle}>
                        {item.productName}
                        {item.variantLabel ? <span style={tokenMutedStyle}> {'·'} {item.variantLabel}</span> : null}
                        <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{item.skuCode}</div>
                        {item.isTrackable && (
                          <>
                            <button
                              onClick={() =>
                                setSerialPicker({
                                  kind: 'new',
                                  key: item.key,
                                  skuId: item.skuId,
                                  skuCode: item.skuCode,
                                  productName: item.productName,
                                  needed: item.qty,
                                })
                              }
                              style={{ ...gray800ButtonStyle, fontSize: 11, marginTop: 4 }}
                            >
                              {item.serialIds.length > 0
                                ? `${item.serialNumbers.join(', ')} (change)`
                                : `Pick ${item.qty} serial${item.qty > 1 ? 's' : ''}`}
                            </button>
                            {!serialDone && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }}>Serials required</div>}
                          </>
                        )}
                      </td>
                      <td style={tableCellStyle}>
                        <input
                          type="number"
                          min={1}
                          value={item.qty}
                          onChange={(e) => {
                            const qty = Math.max(1, parseInt(e.target.value) || 1);
                            updateNewItemRow(item.key, {
                              qty,
                              serialIds: item.serialIds.slice(0, qty),
                              serialNumbers: item.serialNumbers.slice(0, qty),
                            });
                            if (item.isTrackable && item.serialIds.length !== qty) {
                              setSerialPicker({
                                kind: 'new',
                                key: item.key,
                                skuId: item.skuId,
                                skuCode: item.skuCode,
                                productName: item.productName,
                                needed: qty,
                              });
                            }
                          }}
                          style={{ ...fieldStyle, width: 64 }}
                        />
                      </td>
                      <td style={tableCellStyle}>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateNewItemRow(item.key, { unitPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                          style={{ ...fieldStyle, width: 96 }}
                        />
                      </td>
                      <td style={tableCellStyle}>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.discountAmount}
                          onChange={(e) => updateNewItemRow(item.key, { discountAmount: Math.max(0, parseFloat(e.target.value) || 0) })}
                          style={{ ...fieldStyle, width: 88 }}
                        />
                      </td>
                      <td style={tableCellStyle}>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.taxAmount}
                          onChange={(e) => updateNewItemRow(item.key, { taxAmount: Math.max(0, parseFloat(e.target.value) || 0) })}
                          style={{ ...fieldStyle, width: 88 }}
                        />
                      </td>
                      <td style={{ ...tableCellStyle, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {formatMoney(item.qty * item.unitPrice - item.discountAmount + item.taxAmount)}
                      </td>
                      <td style={tableCellStyle}>
                        <button onClick={() => removeNewItemRow(item.key)} style={{ ...dangerButtonStyle, fontSize: 12 }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 6px' }}>3. Settlement</div>
        <article style={surfaceCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
            <span style={{ color: '#64748b' }}>New Items Total</span>
            <span>{formatMoney(newItemsTotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
            <span style={{ color: '#64748b' }}>Trade-in Credit</span>
            <span>-{formatMoney(tradeInCredit)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, borderTop: '2px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
            <span style={{ color: needsRefund ? '#dc2626' : needsPayment ? '#b45309' : 'inherit' }}>
              {needsPayment ? 'Customer Pays' : needsRefund ? 'Refund Due' : 'No Difference'}
            </span>
            <span style={{ color: needsRefund ? '#dc2626' : needsPayment ? '#b45309' : 'inherit' }}>
              {formatMoney(Math.abs(difference))}
            </span>
          </div>

          {needsPayment && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Payment (must total {formatMoney(difference)} — currently {formatMoney(tendersSum)})
                {!paymentsComplete && <span style={{ color: '#dc2626' }}> ✕</span>}
                {paymentsComplete && <span style={{ color: '#16a34a' }}> ✓</span>}
              </div>
              {tenders.map((tender, index) => (
                <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <select
                    value={tender.paymentMethod}
                    onChange={(e) => updateTender(index, { paymentMethod: e.target.value })}
                    style={{ ...fieldStyle, width: 160 }}
                  >
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Amount"
                    value={tender.amount}
                    onChange={(e) => updateTender(index, { amount: e.target.value })}
                    style={{ ...fieldStyle, width: 120 }}
                  />
                  <input
                    placeholder="Reference (txn no.)"
                    value={tender.referenceNo}
                    onChange={(e) => updateTender(index, { referenceNo: e.target.value })}
                    style={{ ...fieldStyle, flex: 1, minWidth: 160 }}
                  />
                  <button onClick={() => removeTender(index)} style={{ ...dangerButtonStyle, fontSize: 12 }}>✕</button>
                </div>
              ))}
              <button onClick={addTender} style={{ ...secondaryButtonStyle, fontSize: 13 }}>+ Add Payment</button>
            </div>
          )}

          {needsRefund && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>Refund Method *</label>
                <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} style={{ ...fieldStyle, width: 180 }}>
                  <option value="">Select method</option>
                  {REFUND_METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  Reference {refundMethod && refundMethod !== 'cash' ? '*' : ''}
                </label>
                <input
                  value={refundReference}
                  onChange={(e) => setRefundReference(e.target.value)}
                  placeholder="Txn / cheque no."
                  style={{ ...fieldStyle, width: 200 }}
                />
              </div>
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ ...fieldStyle, minHeight: 60, width: '100%', boxSizing: 'border-box' }}
              placeholder="Note (optional)"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={submitExchange} style={dangerButtonStyle} disabled={processing}>
              {processing ? 'Processing...' : needsPayment ? 'Complete Exchange (Collect Payment)' : needsRefund ? 'Complete Exchange (Refund Difference)' : 'Complete Exchange'}
            </button>
            <button onClick={() => { setSelectedSale(null); setError(''); }} style={secondaryButtonStyle}>
              Cancel
            </button>
          </div>
          <p style={{ ...tokenMutedStyle, fontSize: 12, marginTop: 12 }}>
            Credit per returned line = paid portion of its line value ({Math.round(selectedSale.paidRatio * 100)}% paid on this sale). Returned serials are restored to stock and their warranties voided.
          </p>
        </article>

        <SerialPickerModal
          open={Boolean(serialPicker)}
          skuId={serialPicker?.skuId ?? ''}
          skuCode={serialPicker?.skuCode ?? ''}
          productName={serialPicker?.productName ?? ''}
          onSelect={handleSerialSelect}
          onClose={() => setSerialPicker(null)}
        />
      </div>
    );
  }

  // ── History detail view ──
  if (tab === 'history' && detail) {
    const ex = detail.exchange;
    const returned = detail.items.filter((i) => i.side === 'returned');
    const fresh = detail.items.filter((i) => i.side === 'new');
    return (
      <div style={pageShellStyle}>
        <button onClick={() => setDetail(null)} style={{ ...secondaryButtonStyle, marginBottom: 10 }}>
          &larr; Back to Exchange History
        </button>
        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '6px 10px', borderRadius: 6, marginBottom: 12, fontSize: 14 }}>
            {error}
          </div>
        )}
        <article style={surfaceCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>Exchange {ex.exchange_no}</h3>
              <p style={{ ...tokenMutedStyle, margin: '4px 0 0' }}>
                Original sale {ex.original_sale_no} · {ex.customer_name || 'Walk-in'}{ex.customer_phone ? ` · ${ex.customer_phone}` : ''} · {new Date(ex.created_at).toLocaleString('en-BD')}
              </p>
              {ex.processed_by_name && <p style={{ ...tokenMutedStyle, margin: '2px 0 0', fontSize: 12 }}>Processed by {ex.processed_by_name}{ex.location_name ? ` · ${ex.location_name}` : ''}</p>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => void handleReprint(ex.id)} style={gray800ButtonStyle}>Print</button>
            </div>
          </div>

          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 6 }}>Trade-in Items</div>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Item</th>
                  <th style={tableHeaderCellStyle}>Serial</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'center' }}>Qty</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Credit</th>
                  <th style={tableHeaderCellStyle}>Restock</th>
                </tr>
              </thead>
              <tbody>
                {returned.map((item) => (
                  <tr key={item.id}>
                    <td style={tableCellStyle}>{item.product_name_snapshot}<div style={{ ...tokenMutedStyle, fontSize: 11 }}>{item.sku_code_snapshot}</div></td>
                    <td style={{ ...tableCellStyle, ...tokenMutedStyle, fontSize: 12 }}>{item.serial_number || item.imei_number || '—'}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'center' }}>{item.qty}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', color: '#16a34a' }}>+{formatMoney(item.line_credit)}</td>
                    <td style={tableCellStyle}>{item.restock ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 6, marginTop: 12 }}>New Items</div>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Item</th>
                  <th style={tableHeaderCellStyle}>Serial</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'center' }}>Qty</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Unit Price</th>
                  <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {fresh.map((item) => (
                  <tr key={item.id}>
                    <td style={tableCellStyle}>{item.product_name_snapshot}<div style={{ ...tokenMutedStyle, fontSize: 11 }}>{item.sku_code_snapshot}</div></td>
                    <td style={{ ...tableCellStyle, ...tokenMutedStyle, fontSize: 12 }}>{item.serial_number || item.imei_number || '—'}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'center' }}>{item.qty}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>{formatMoney(item.unit_price)}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', fontWeight: 600 }}>{formatMoney(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--muted)', borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: '#64748b' }}>New Items Total</span>
              <span>{formatMoney(ex.new_items_total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: '#64748b' }}>Trade-in Credit</span>
              <span>-{formatMoney(ex.trade_in_credit)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '2px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
              <span>{ex.difference >= 0 ? 'Customer Paid' : 'Refunded'}</span>
              <span>{formatMoney(Math.abs(ex.difference))}</span>
            </div>
            {ex.difference < 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#dc2626' }}>
                Refund via {ex.refund_method}{ex.refund_reference ? ` · Ref: ${ex.refund_reference}` : ''}
              </div>
            )}
          </div>
        </article>
      </div>
    );
  }

  // ── Lookup view (new tab) / history list (history tab) ──
  return (
    <div style={pageShellStyle}>
      
      <div style={{ marginBottom: 10 }}>
        <WorkspaceTabs
          tabs={[
            { key: 'new', label: 'New Exchange' },
            { key: 'history', label: 'History' },
          ]}
          active={tab}
          onChange={(key) => { setTab(key as 'new' | 'history'); setError(''); if (key === 'history') void loadHistory(1); }}
        />
      </div>

      {message && (
        <div style={{ background: '#d1fae5', color: '#065f46', padding: '6px 10px', borderRadius: 6, marginBottom: 12, fontSize: 14 }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '6px 10px', borderRadius: 6, marginBottom: 12, fontSize: 14 }}>
          {error}
        </div>
      )}

      {tab === 'new' ? (
        <>
          <article style={surfaceCardStyle}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>Find the Original Sale</label>
                <input
                  value={lookupValue}
                  onChange={(e) => setLookupValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runLookup(); } }}
                  style={{ ...fieldStyle, width: '100%' }}
                  placeholder="Search by customer phone, sale no, or invoice no"
                />
              </div>
              <button onClick={() => void runLookup()} style={searchButtonStyle} disabled={lookupLoading}>
                {lookupLoading ? 'Searching...' : 'Find Sales'}
              </button>
            </div>
          </article>

          {lookupSales.length > 0 && (
            <div style={{ ...tableWrapStyle, marginTop: 10 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Sale</th>
                    <th style={tableHeaderCellStyle}>Customer</th>
                    <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Total</th>
                    <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Paid</th>
                    <th style={tableHeaderCellStyle}>Date</th>
                    <th style={tableHeaderCellStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lookupSales.map((sale) => (
                    <tr key={sale.saleId}>
                      <td style={tableCellStyle}>
                        <strong>{sale.saleNo}</strong>
                        {sale.invoiceNo && sale.invoiceNo !== sale.saleNo ? <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{sale.invoiceNo}</div> : null}
                      </td>
                      <td style={tableCellStyle}>
                        {sale.customerName || 'Walk-in'}
                        {sale.customerPhone ? <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{sale.customerPhone}</div> : null}
                      </td>
                      <td style={{ ...tableCellStyle, textAlign: 'right' }}>{formatMoney(sale.totalAmount)}</td>
                      <td style={{ ...tableCellStyle, textAlign: 'right' }}>{formatMoney(sale.paidAmount)}</td>
                      <td style={tableCellStyle}>
                        {new Date(sale.soldAt).toLocaleDateString('en-BD', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td style={tableCellStyle}>
                        <button onClick={() => selectSale(sale)} style={gray800ButtonStyle}>Exchange</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lookupSales.length === 0 && !lookupLoading && !error && (
            <div style={{ ...emptyStateStyle, marginTop: 10 }}>
              Look up the original sale by customer phone or sale/invoice number to begin an exchange.
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ ...searchRowStyle, marginBottom: 10 }}>
            <input
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void loadHistory(1); } }}
              style={{ ...fieldStyle, flex: 1, width: 'auto' }}
              placeholder="Search by exchange no, customer, phone, or original sale no"
            />
            <button onClick={() => void loadHistory(1)} style={searchButtonStyle} disabled={historyLoading}>
              {historyLoading ? 'Loading...' : 'Search'}
            </button>
          </div>

          <article style={surfaceCardStyle}>
            {historyRows.length === 0 && !historyLoading ? (
              <div style={emptyStateStyle}>
                {historyQuery ? 'No exchanges found matching your search.' : 'No exchanges yet. Complete an exchange to see it here.'}
              </div>
            ) : (
              <div style={tableWrapStyle}>
                <table style={{ ...tableStyle, tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ ...tableHeaderCellStyle, width: '14%' }}>Exchange</th>
                      <th style={{ ...tableHeaderCellStyle, width: '12%' }}>Original Sale</th>
                      <th style={{ ...tableHeaderCellStyle, width: '18%' }}>Customer</th>
                      <th style={{ ...tableHeaderCellStyle, width: '22%' }}>Items</th>
                      <th style={{ ...tableHeaderCellStyle, width: '14%', textAlign: 'right' }}>Difference</th>
                      <th style={{ ...tableHeaderCellStyle, width: '20%' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr key={row.id}>
                        <td style={tableCellStyle}>
                          <strong>{row.exchange_no}</strong>
                          <div style={{ ...tokenMutedStyle, fontSize: 11 }}>
                            {new Date(row.created_at).toLocaleDateString('en-BD', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                        </td>
                        <td style={tableCellStyle}>{row.original_sale_no}</td>
                        <td style={tableCellStyle}>
                          {row.customer_name || 'Walk-in'}
                          {row.customer_phone ? <div style={{ ...tokenMutedStyle, fontSize: 11 }}>{row.customer_phone}</div> : null}
                        </td>
                        <td style={{ ...tableCellStyle, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.items_summary || '—'}
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, color: row.difference >= 0 ? '#b45309' : '#dc2626' }}>
                          {row.difference >= 0 ? '+' : '-'}
                          {formatMoney(Math.abs(row.difference))}
                        </td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => void openDetail(row.id)} style={{ ...gray800ButtonStyle, fontSize: 12 }}>View</button>
                            <button onClick={() => void handleReprint(row.id)} style={{ ...secondaryButtonStyle, fontSize: 12 }}>Print</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {historyTotal > historyLimit && (
              <div style={{ marginTop: 12 }}>
                <ListPager
                  page={historyPage}
                  pagination={{ page: historyPage, total: historyTotal, limit: historyLimit }}
                  label="exchanges"
                  onPrevious={() => { const np = Math.max(1, historyPage - 1); void loadHistory(np); }}
                  onNext={() => { if (historyPage < Math.ceil(historyTotal / historyLimit)) void loadHistory(historyPage + 1); }}
                />
              </div>
            )}
          </article>
        </>
      )}
    </div>
  );
}
