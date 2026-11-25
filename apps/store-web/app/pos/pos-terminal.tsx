'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_PRINT_AGENT_URL,
  fetchPrintAgentHealth,
  downloadReceiptHtml,
  openCashDrawer,
  openInvoicePrintWindow,
  printLabel,
  printReceipt,
  renderInvoicePreview,
  type PrintAgentHealth,
  type ReceiptPayload,
} from '../../lib/print-agent';
import { trFor } from '../../lib/i18n';
import { loadWorkstationProfile } from '../../lib/workstation-profile';
import { SerialPickerModal } from './serial-picker-modal';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import {
  accentButtonStyle,
  compactSurfaceCardStyle,
  fieldStyle,
  gray800ButtonStyle,
  neutralButtonStyle,
  primaryButtonStyle,
  sectionPanelStyle,
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
import { stackedFilterGridStyle, useCompactLayout, WorkspaceTabs } from '../workspace-responsive';

type Register = {
  id: string;
  code: string;
  name: string;
  status: string;
  open_shift_id?: string | null;
};

type Location = {
  id: string;
  code: string;
  name: string;
  location_type: string;
  status: string;
};

type SkuSearchResult = {
  id: string;
  product_id: string;
  sku_code: string;
  barcode?: string | null;
  variant_label?: string | null;
  variant_json?: Record<string, unknown> | null;
  product_name: string;
  unit?: string | null;
  has_variants?: boolean;
  variant_mode?: string | null;
  is_trackable?: boolean;
  serial_tracking_enabled?: boolean;
  requires_serial?: boolean;
  requires_imei?: boolean;
  in_stock_serial_count?: number | string | null;
  sale_price?: string | number | null;
  available_qty?: string | number | null;
  discount_type?: string | null;
  discount_value?: string | number | null;
  matched_serial_id?: string | null;
  matched_serial_number?: string | null;
};

type ProductVariantDetail = {
  product: {
    id: string;
    product_code: string;
    name: string;
    has_variants: boolean;
    variant_mode: string;
    is_trackable: boolean;
  };
  skus: Array<{
    id: string;
    sku_code: string;
    barcode?: string | null;
    variant_label?: string | null;
    serial_tracking_enabled?: boolean;
    requires_serial?: boolean;
    requires_imei?: boolean;
    in_stock_serial_count?: number | string | null;
    sale_price?: string | number | null;
    available_qty?: string | number | null;
    status: string;
  }>;
};

type CartItem = {
  skuId: string;
  skuCode: string;
  productName: string;
  unit?: string | null;
  variantLabel?: string | null;
  unitPrice: number;
  qty: number;
  availableQty: number;
  barcode?: string | null;
  discountAmount: number;
  discountType: string;
  isTrackable?: boolean;
  requiresSerial?: boolean;
  selectedSerials?: Array<{ serialId: string; serialNumber: string; imei?: string | null }>;
};

type ParkedSale = {
  id: string; ts: number; label: string; cart: CartItem[];
  customerName: string; customerPhone: string; customerEmail: string;
  customerShopName: string; customerAddress: string;
  saleMode: 'paid' | 'due' | 'cod'; documentMode: 'pos' | 'a5' | 'a4'; dueDate: string;
};

type SettingsForPos = { settings?: { receipt_type?: 'pos' | 'a5' | 'a4'; default_location_id?: string } };

type ShiftResponse = {
  shift?: {
    id: string;
    status: string;
  };
};

type SaleCreateResponse = {
  sale?: {
    id: string;
    saleNo: string;
    totalAmount: number;
    createdAt: string;
  };
};

type ReprintResponse = {
  receipt?: ReceiptPayload;
};

type Category = { id: string; parent_id?: string | null; parent_name?: string | null; code: string; name: string; status: string };
type Brand = { id: string; name: string; status: string };

const SHOW_SHIFT_CONTROLS = false;

const currency = (value: number) => value.toFixed(2);
const formatQty = (value: number | string | null | undefined) => {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return '0';
  return Number.isInteger(numeric) ? String(numeric) : String(numeric).replace(/\.?0+$/, '');
};

const cardStyle = surfaceCardStyle;
const compactCardStyle = compactSurfaceCardStyle;
const inputStyle = fieldStyle;
const buttonStyle = secondaryButtonStyle;

// Rendered paper width in CSS pixels (96dpi) of the invoice document itself:
// the A4 sheet is 192mm wide inside its margins, A5 is 140mm. Keeping the
// preview at true paper width is what makes A4 and A5 read as different paper.
const PAPER_WIDTH_PX: Record<'a4' | 'a5', number> = { a4: 726, a5: 529 };

function isLoopbackAgent(url: string) {
  return url.includes('127.0.0.1') || url.includes('localhost');
}

function getSkuAvailableQty(sku: Pick<SkuSearchResult, 'available_qty'> | Pick<ProductVariantDetail['skus'][number], 'available_qty'>) {
  return Number(sku.available_qty ?? 0);
}

// A SKU needs an individual serial/IMEI when it is explicitly serial-tracked
// (product or SKU flag), or when serials are actually in stock for it. The
// legacy `is_trackable` flag alone is NOT enough — bulk goods carry it by
// default but have no serials, while serial-tracked items can have been
// received without ever setting it.
function needsSerialTracking(sku: {
  serial_tracking_enabled?: boolean;
  requires_serial?: boolean;
  requires_imei?: boolean;
  in_stock_serial_count?: number | string | null;
}) {
  if (sku.serial_tracking_enabled || sku.requires_serial || sku.requires_imei) return true;
  return Number(sku.in_stock_serial_count ?? 0) > 0;
}

const OFFLINE_SALES_KEY = 'offline_sales_v1';

type QueuedSale = { clientRequestId: string; body: Record<string, unknown>; ts: number };

function readOfflineSales(): QueuedSale[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_SALES_KEY) || '[]') as QueuedSale[];
  } catch {
    return [];
  }
}

function writeOfflineSales(list: QueuedSale[]) {
  localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify(list));
}

function isNetworkError(message: string) {
  return /failed to fetch|networkerror|fetch failed|load failed|network request failed/i.test(message);
}

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message)
        ? ((payload as any).error || (payload as any).message)
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export function PosTerminal({ canUsePos, canUseInvoices = false, locale = 'en' }: { canUsePos: boolean; canUseInvoices?: boolean; locale?: 'en' | 'bn' }) {
  const t = trFor(locale);
  const compact = useCompactLayout();
  const [registers, setRegisters] = useState<Register[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SkuSearchResult[]>([]);
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);
  const [variantProduct, setVariantProduct] = useState<ProductVariantDetail | null>(null);
  const [variantPickerHint, setVariantPickerHint] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerShopName, setCustomerShopName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [saleMode, setSaleMode] = useState<'paid' | 'due' | 'cod'>('paid');
  const [documentMode, setDocumentMode] = useState<'pos' | 'a5' | 'a4'>('pos');
  const [customerLookup, setCustomerLookup] = useState<{ checking: boolean; matched: { id?: string; name: string; shopName: string; address: string; email: string } | null }>({ checking: false, matched: null });
  const [customerPriceMap, setCustomerPriceMap] = useState<Record<string, number>>({});
  const [lastSoldCart, setLastSoldCart] = useState<CartItem[]>([]);
  const [deliveryCharge, setDeliveryCharge] = useState('');
  const clientRequestIdRef = useRef<string>('');
  const [customerExpanded, setCustomerExpanded] = useState(false);
  const [showTaxFields, setShowTaxFields] = useState(false);
  const [splitMethods, setSplitMethods] = useState<Array<'cash' | 'card' | 'mfs' | 'bank_transfer'>>(['cash']);
  const [customerOutstanding, setCustomerOutstanding] = useState<number | null>(null);
  const [advanceMethod, setAdvanceMethod] = useState<'cash' | 'mfs' | 'bank_transfer'>('mfs');
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMethod, setCollectMethod] = useState('cash');
  const [collecting, setCollecting] = useState(false);
  const [exchangeEnabled, setExchangeEnabled] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mfs' | 'bank_transfer'>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [orderDiscount, setOrderDiscount] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [usePartialPayments, setUsePartialPayments] = useState(false);
  const [partialPayments, setPartialPayments] = useState<Record<'cash' | 'card' | 'mfs' | 'bank_transfer', { amount: string; reference: string }>>({
    cash: { amount: '', reference: '' },
    card: { amount: '', reference: '' },
    mfs: { amount: '', reference: '' },
    bank_transfer: { amount: '', reference: '' },
  });
  const [exchangeItem, setExchangeItem] = useState<{ skuId: string; skuCode: string; productName: string; category: string; brand: string; costPrice: number; salePrice: number; exchangeAmount: number } | null>(null);
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);

  // Serial picker state
  const [serialPickerOpen, setSerialPickerOpen] = useState(false);
  const [serialPickerSkuId, setSerialPickerSkuId] = useState('');
  const [serialPickerSkuCode, setSerialPickerSkuCode] = useState('');
  const [serialPickerProductName, setSerialPickerProductName] = useState('');
  const [serialPickerCartIndex, setSerialPickerCartIndex] = useState<number>(-1);
  const [serialPickerPreferredId, setSerialPickerPreferredId] = useState<string>('');
  const [exchangeFormName, setExchangeFormName] = useState('');
  const [exchangeFormCategory, setExchangeFormCategory] = useState('');
  const [exchangeFormBrand, setExchangeFormBrand] = useState('');
  const [exchangeFormCostPrice, setExchangeFormCostPrice] = useState('');
  const [exchangeFormSellPrice, setExchangeFormSellPrice] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('0');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('POS ready.');

  const [printHealth, setPrintHealth] = useState<PrintAgentHealth | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [lastInvoice, setLastInvoice] = useState<ReceiptPayload | null>(null);
  const [lastInvoiceMode, setLastInvoiceMode] = useState<'a5' | 'a4'>('a5');
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [receiptPrinterName, setReceiptPrinterName] = useState('');
  const [labelPrinterName, setLabelPrinterName] = useState('');
  const [agentUrl, setAgentUrl] = useState(DEFAULT_PRINT_AGENT_URL);
  // Scoped renderings of the print document. The scope id keeps the
  // document's own stylesheet from resetting the POS page it is embedded in.
  const invoiceSheetPreview = useMemo(
    () => (lastInvoice ? renderInvoicePreview(lastInvoice, lastInvoiceMode, 'pos-invoice-sheet-preview') : ''),
    [lastInvoice, lastInvoiceMode],
  );
  const invoiceNotesPreview = useMemo(
    () => (lastInvoice ? renderInvoicePreview(lastInvoice, lastInvoiceMode, 'pos-invoice-notes-preview') : ''),
    [lastInvoice, lastInvoiceMode],
  );
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState(0);
  const [pickerSkuId, setPickerSkuId] = useState('');
  const [pickerQty, setPickerQty] = useState('1');
  const [pickerDiscount, setPickerDiscount] = useState('');
  const [lastRemoved, setLastRemoved] = useState<{ item: CartItem; index: number } | null>(null);
  const [parkedSales, setParkedSales] = useState<ParkedSale[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'cart' | 'checkout'>('search');

  useEffect(() => {
    void Promise.all([
      readJson<{ registers: Register[] }>('/api/pos/registers'),
      readJson<{ locations: Location[] }>('/api/pos/locations'),
      readJson<{ categories: Category[] }>('/api/catalog/categories?status=active&limit=200'),
      readJson<{ brands: Brand[] }>('/api/catalog/brands?status=active&limit=200'),
      readJson<{ settings: { receipt_type?: 'pos' | 'a5' | 'a4'; default_location_id?: string } }>('/api/store/settings').catch(() => ({ settings: {} as SettingsForPos['settings'] })),
    ])
      .then(([registerPayload, locationPayload, catPayload, brandPayload, settingsPayload]) => {
        setRegisters(registerPayload.registers ?? []);
        setLocations(locationPayload.locations ?? []);
        setSelectedRegisterId(registerPayload.registers?.[0]?.id ?? '');
        const settingsData: SettingsForPos['settings'] = settingsPayload.settings;
        const savedLocationId = localStorage.getItem('pos_location_id');
        const validSaved = locationPayload.locations?.find((l) => l.id === savedLocationId);
        const defaultOutlet = settingsData?.default_location_id;
        const validDefault = locationPayload.locations?.find((l) => l.id === defaultOutlet);
        setSelectedLocationId(validSaved?.id ?? validDefault?.id ?? locationPayload.locations?.[0]?.id ?? '');
        setCategories(catPayload.categories ?? []);
        setBrands(brandPayload.brands ?? []);
        const receiptType = settingsData?.receipt_type;
        setDocumentMode(receiptType === 'a4' ? 'a4' : receiptType === 'a5' ? 'a5' : 'pos');
      })
      .catch((error: Error) => {
        setMessage(error.message);
      });
  }, []);

  useEffect(() => {
    const profile = loadWorkstationProfile();
    setReceiptPrinterName(profile.receiptPrinterName);
    setLabelPrinterName(profile.labelPrinterName);
    setAgentUrl(profile.agentUrl);
  }, []);

  // ── Offline sales queue: sales made without internet sync automatically ──
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const syncingOffline = useRef(false);

  const syncOfflineSales = useCallback(async () => {
    if (syncingOffline.current) return;
    const list = readOfflineSales();
    if (!list.length) return;
    syncingOffline.current = true;
    let synced = 0;
    for (const queued of list) {
      try {
        await readJson(`/api/pos/sales`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-idempotency-key': queued.clientRequestId },
          body: JSON.stringify(queued.body),
        });
        const remaining = readOfflineSales().filter((s) => s.clientRequestId !== queued.clientRequestId);
        writeOfflineSales(remaining);
        synced += 1;
      } catch (error) {
        if (isNetworkError((error as Error).message)) break; // still offline — keep the rest queued
        // permanent rejection (validation etc.) — drop it, it will never succeed
        writeOfflineSales(readOfflineSales().filter((s) => s.clientRequestId !== queued.clientRequestId));
      }
    }
    syncingOffline.current = false;
    setOfflineQueueCount(readOfflineSales().length);
    if (synced > 0) {
      setMessage(`${synced} offline sale(s) synced.`);
      toast.success(`${synced} offline sale(s) synced.`);
    }
  }, []);

  useEffect(() => {
    setParkedSales(readParked());
    setOfflineQueueCount(readOfflineSales().length);
    void syncOfflineSales();
    const onOnline = () => { void syncOfflineSales(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [syncOfflineSales]);

  // Customer details matter for due / COD sales — expand automatically.
  useEffect(() => {
    if (saleMode !== 'paid') setCustomerExpanded(true);
  }, [saleMode]);

  // Customer picker: typing a known phone number autofills name/shop/address.
  useEffect(() => {
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length < 6) {
      setCustomerLookup({ checking: false, matched: null });
      setCustomerPriceMap({});
      setCustomerOutstanding(null);
      setCustomerOutstanding(null);
      return;
    }
    setCustomerLookup((cur) => ({ ...cur, checking: true }));
    const timer = setTimeout(async () => {
      try {
        const payload = await readJson<{ customers: Array<{ id: string; full_name?: string | null; mobile_no?: string | null; email?: string | null; shop_name?: string | null; address?: string | null }> }>(
          `/api/store-ops/customers?query=${encodeURIComponent(customerPhone.trim())}&limit=5`,
        );
        const list = payload.customers ?? [];
        const tail = digits.slice(-9);
        const match =
          list.find((c) => (c.mobile_no || '').replace(/\D/g, '').endsWith(tail)) ??
          (list.length === 1 ? list[0] : null);
        if (match) {
          setCustomerLookup({ checking: false, matched: { id: match.id, name: match.full_name || '', shopName: match.shop_name || '', address: match.address || '', email: match.email || '' } });
          if (match.id) {
            try {
              const pricePayload = await readJson<{ prices: Array<{ sku_id: string; price: string }> }>(
                `/api/store-ops/customers/${match.id}/prices`,
              );
              const map: Record<string, number> = {};
              for (const row of pricePayload.prices ?? []) map[row.sku_id] = Number(row.price);
              setCustomerPriceMap(map);
            } catch { setCustomerPriceMap({}); }
          } else {
            setCustomerPriceMap({});
          }
          if (match.full_name) setCustomerName((cur) => cur || match.full_name!);
          if (match.shop_name) setCustomerShopName((cur) => cur || match.shop_name!);
          if (match.address) setCustomerAddress((cur) => cur || match.address!);
          if (match.email) setCustomerEmail((cur) => cur || match.email!);
        } else {
          setCustomerLookup({ checking: false, matched: null });
      setCustomerPriceMap({});
      setCustomerOutstanding(null);
        }
      } catch {
        setCustomerLookup({ checking: false, matched: null });
      setCustomerPriceMap({});
      setCustomerOutstanding(null);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [customerPhone]);

  useEffect(() => {
    const runningHostedStore =
      typeof window !== 'undefined' &&
      !['localhost', '127.0.0.1'].includes(window.location.hostname);
    const workstationLooksConfigured = Boolean(receiptPrinterName || labelPrinterName);
    const shouldAutoProbe = !(
      runningHostedStore &&
      isLoopbackAgent(agentUrl) &&
      !workstationLooksConfigured
    );

    if (!shouldAutoProbe) {
      setPrintHealth(null);
      setPrintError(
        'Local printing is idle on this browser. Configure the Hardware page on the actual POS workstation to enable receipt printing and cash drawer control.',
      );
      return;
    }

    void fetchPrintAgentHealth(agentUrl)
      .then((health) => {
        setPrintHealth(health);
        setPrintError(null);
      })
      .catch((error: Error) => {
        setPrintHealth(null);
        setPrintError(
          isLoopbackAgent(agentUrl)
            ? 'Local print agent is unreachable from this browser. Sales still save normally and the invoice preview will open if printing fails.'
            : error.message,
        );
      });
  }, [agentUrl, labelPrinterName, receiptPrinterName]);

  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!search.trim()) {
      setResults([]);
      setSearching(false);
      setShowSuggestions(false);
      return;
    }

    setSearching(true);
    setShowSuggestions(true);

    searchDebounceRef.current = setTimeout(() => {
      void searchCatalog(search.trim());
    }, 100);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [search]);

  const selectedRegister = useMemo(
    () => registers.find((register) => register.id === selectedRegisterId) ?? null,
    [registers, selectedRegisterId],
  );

  const openShiftId = selectedRegister?.open_shift_id || null;

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.qty * item.unitPrice, 0),
    [cart],
  );

  const totalDiscount = useMemo(
    () => cart.reduce((sum, item) => sum + item.discountAmount, 0),
    [cart],
  );

  const orderDiscountAmount = useMemo(() => Math.max(Number(orderDiscount || 0), 0), [orderDiscount]);
  const vatAmountValue = useMemo(() => Math.max(Number(vatAmount || 0), 0), [vatAmount]);
  const taxAmountValue = useMemo(() => Math.max(Number(taxAmount || 0), 0), [taxAmount]);
  const deliveryChargeValue = useMemo(() => Math.max(Number(deliveryCharge || 0), 0), [deliveryCharge]);

  const grandTotal = useMemo(
    () => Math.max(total - totalDiscount - orderDiscountAmount + vatAmountValue + taxAmountValue + deliveryChargeValue, 0),
    [total, totalDiscount, orderDiscountAmount, vatAmountValue, taxAmountValue, deliveryChargeValue],
  );

  const exchangeCost = exchangeItem?.costPrice ?? 0;

  const paymentRequired = useMemo(
    () => exchangeEnabled && exchangeItem ? Math.max(grandTotal - exchangeCost, 0) : Math.max(grandTotal, 0),
    [exchangeEnabled, exchangeItem, exchangeCost, grandTotal],
  );

  const totalPaidFromPartial = useMemo(
    () => (Object.values(partialPayments) as Array<{ amount: string; reference: string }>).reduce((sum, p) => sum + Number(p.amount || 0), 0),
    [partialPayments],
  );

  const changeAmount = useMemo(() => {
    if (saleMode === 'due') return 0;
    if (usePartialPayments) {
      return Math.max(totalPaidFromPartial - paymentRequired, 0);
    }
    if (paymentMethod !== 'cash') return 0;
    const paid = Number(cashReceived || 0);
    return Math.max(paid - paymentRequired, 0);
  }, [cashReceived, paymentMethod, saleMode, paymentRequired, usePartialPayments, totalPaidFromPartial]);

  const groupedResults = useMemo(() => {
    const groups = new Map<string, {
      productId: string;
      productName: string;
      hasVariants: boolean;
      variantMode: string | null;
      skuCount: number;
      lowestPrice: number;
      totalAvailable: number;
      skus: SkuSearchResult[];
    }>();

    for (const sku of results) {
      const existing = groups.get(sku.product_id);
      const salePrice = Number(sku.sale_price ?? 0);
      const availableQty = Number(sku.available_qty ?? 0);
      if (existing) {
        existing.skuCount += 1;
        existing.totalAvailable += availableQty;
        existing.lowestPrice = Math.min(existing.lowestPrice, salePrice);
        existing.skus.push(sku);
        continue;
      }

      groups.set(sku.product_id, {
        productId: sku.product_id,
        productName: sku.product_name,
        hasVariants: Boolean(sku.has_variants),
        variantMode: sku.variant_mode ?? null,
        skuCount: 1,
        lowestPrice: salePrice,
        totalAvailable: availableQty,
        skus: [sku],
      });
    }

    return Array.from(groups.values());
  }, [results]);

  const clearSearchState = () => {
    setSearch('');
    setResults([]);
    setSearching(false);
    setShowSuggestions(false);
    setSearchHighlight(0);
    searchInputRef.current?.focus();
  };

  const openVariantPicker = (
    group: {
      productId: string;
      productName: string;
      hasVariants: boolean;
      variantMode: string | null;
      skus: SkuSearchResult[];
    },
    hint = '',
  ) => {
    setVariantProduct({
      product: {
        id: group.productId,
        product_code: '',
        name: group.productName,
        has_variants: group.hasVariants,
        variant_mode: group.variantMode ?? 'multi',
        is_trackable: group.skus[0]?.is_trackable ?? true,
      },
      skus: group.skus.map((sku) => ({
        id: sku.id,
        sku_code: sku.sku_code,
        barcode: sku.barcode,
        variant_label: sku.variant_label,
        variant_json: sku.variant_json,
        serial_tracking_enabled: sku.serial_tracking_enabled,
        requires_serial: sku.requires_serial,
        requires_imei: sku.requires_imei,
        in_stock_serial_count: sku.in_stock_serial_count,
        sale_price: sku.sale_price,
        available_qty: sku.available_qty,
        status: 'active',
      })),
    });
    setVariantPickerHint(hint);
    const firstAvailable = group.skus.find((sku) => (sku.is_trackable === false && !sku.requires_serial && !sku.requires_imei) || Number(sku.available_qty ?? 0) > 0) ?? group.skus[0];
    setPickerSkuId(firstAvailable?.id ?? '');
    setPickerQty('1');
    setPickerDiscount('');
    setVariantPickerOpen(true);
  };

  const confirmPickerAdd = () => {
    const sku = (variantProduct?.skus ?? []).find((s) => s.id === pickerSkuId);
    if (!sku) { setMessage('Select a variant first.'); return; }
    const skuIsTrackable = variantProduct?.product.is_trackable ?? true;
    const skuNeedsSerial = needsSerialTracking(sku);
    const available = (!skuIsTrackable && !skuNeedsSerial) || getSkuAvailableQty(sku) > 0;
    if (!available) {
      setMessage(`${variantProduct?.product.name ?? 'Product'} is out of stock in the selected location.`);
      return;
    }
    const qty = Math.max(Math.floor(Number(pickerQty || 1)), 1);
    const discount = Math.max(Number(pickerDiscount || 0), 0);
    addSkuToCart({
      id: sku.id,
      sku_code: sku.sku_code,
      barcode: sku.barcode,
      variant_label: sku.variant_label,
      serial_tracking_enabled: sku.serial_tracking_enabled,
      requires_serial: sku.requires_serial,
      requires_imei: sku.requires_imei,
      in_stock_serial_count: sku.in_stock_serial_count,
      product_name: variantProduct?.product.name ?? '',
      sale_price: sku.sale_price,
      available_qty: sku.available_qty,
      is_trackable: skuIsTrackable,
      discount_type: (sku as any).discount_type,
      discount_value: (sku as any).discount_value,
    }, discount > 0 ? { discountAmount: discount, discountType: 'amount' } : undefined, qty);
    setVariantPickerOpen(false);
    clearSearchState();
    setMessage(`${variantProduct?.product.name ?? 'Product'} × ${qty} added to cart.`);
  };

  const pickerSku = (variantProduct?.skus ?? []).find((s) => s.id === pickerSkuId) ?? null;
  const pickerLineTotal = pickerSku
    ? currency(Math.max(Number(pickerQty || 0) * (Number(pickerSku.sale_price ?? 0) - Number(pickerDiscount || 0)), 0))
    : currency(0);

  const addSkuToCart = (sku: Pick<SkuSearchResult, 'id' | 'sku_code' | 'product_name' | 'unit' | 'variant_label' | 'sale_price' | 'available_qty' | 'barcode' | 'is_trackable' | 'serial_tracking_enabled' | 'requires_serial' | 'requires_imei' | 'in_stock_serial_count' | 'discount_type' | 'discount_value' | 'matched_serial_id'>, discountOverride?: { discountAmount: number; discountType: string }, qtyOverride = 1) => {
    const isTrackable = sku.is_trackable !== false;
    const needsSerial = needsSerialTracking(sku);
    const availableQty = isTrackable || needsSerial ? getSkuAvailableQty(sku) : 999999;
    if ((isTrackable || needsSerial) && availableQty <= 0) {
      setMessage(`${sku.product_name} is out of stock in the selected location.`);
      return;
    }

    setCart((current) => {
      const index = current.findIndex((item) => item.skuId === sku.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = {
          ...next[index],
          qty: Math.min(next[index].qty + 1, availableQty),
        };
        return next;
      }

      const catalogPrice = Number(sku.sale_price ?? 0);
      const unitPrice = customerPriceMap[sku.id] ?? catalogPrice;
      let discountAmount = 0;
      let discountType = '';
      if (discountOverride) {
        discountAmount = discountOverride.discountAmount;
        discountType = discountOverride.discountType;
      } else if (sku.discount_type) {
        discountType = sku.discount_type;
        discountAmount = sku.discount_type === 'fixed'
          ? Number(sku.discount_value ?? 0)
          : unitPrice * Number(sku.discount_value ?? 0) / 100;
      }
      return [
        ...current,
        {
          skuId: sku.id,
          skuCode: sku.sku_code,
          productName: sku.product_name,
          unit: sku.unit ?? null,
          variantLabel: sku.variant_label,
          unitPrice,
          qty: Math.max(qtyOverride, 1),
          availableQty,
          barcode: sku.barcode,
          discountAmount,
          discountType,
          isTrackable,
          requiresSerial: needsSerial,
        },
      ];
    });

    // Open serial picker when the SKU is serial/IMEI tracked
    if (needsSerial) {
      setSerialPickerSkuId(sku.id);
      setSerialPickerSkuCode(sku.sku_code);
      setSerialPickerProductName(sku.product_name);
      setSerialPickerPreferredId(sku.matched_serial_id || '');
      // Find the index of the newly added item
      setCart((prev) => {
        const idx = prev.findIndex((i) => i.skuId === sku.id);
        setSerialPickerCartIndex(idx >= 0 ? idx : prev.length);
        return prev;
      });
      setSerialPickerOpen(true);
    }
  };

  const searchCatalog = async (queryText = search.trim()) => {
    if (!queryText) {
      setResults([]);
      setSearching(false);
      setShowSuggestions(false);
      return;
    }

    setLoading(true);
    try {
      const query = new URLSearchParams({
        q: queryText,
        limit: '20',
      });
      if (selectedLocationId) {
        query.set('locationId', selectedLocationId);
      }
      const payload = await readJson<{ skus: SkuSearchResult[] }>(`/api/pos/search?${query.toString()}`);
      setResults(payload.skus ?? []);
      const exactBarcodeMatch = (payload.skus ?? []).find((sku) => sku.barcode && sku.barcode === queryText);
      if (exactBarcodeMatch) {
        if (exactBarcodeMatch.has_variants) {
          const matchingGroup = (payload.skus ?? []).filter((sku) => sku.product_id === exactBarcodeMatch.product_id);
          openVariantPicker({
            productId: exactBarcodeMatch.product_id,
            productName: exactBarcodeMatch.product_name,
            hasVariants: true,
            variantMode: exactBarcodeMatch.variant_mode ?? null,
            skus: matchingGroup,
          }, `Barcode ${queryText} matched this product. Choose the exact variant.`);
        } else {
          addSkuToCart(exactBarcodeMatch);
          clearSearchState();
          setMessage(`${exactBarcodeMatch.product_name} added to cart from barcode scan.`);
        }
        return;
      }

      setMessage(`Found ${payload.skus?.length ?? 0} matching SKU(s).`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  // ── Exchange product selection ──

  const openExchangeModal = () => {
    setExchangeFormName(exchangeItem?.productName ?? '');
    setExchangeFormCategory(exchangeItem?.category ?? '');
    setExchangeFormBrand(exchangeItem?.brand ?? '');
    setExchangeFormCostPrice(exchangeItem?.costPrice ? String(exchangeItem.costPrice) : '');
    setExchangeFormSellPrice(exchangeItem?.salePrice ? String(exchangeItem.salePrice) : '');
    setExchangeModalOpen(true);
  };

  const saveExchangeItem = async () => {
    if (!exchangeFormName.trim()) return;
    try {
      const result = await readJson<{ skuId: string; skuCode: string }>('/api/pos/exchange-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: exchangeFormName.trim(),
          categoryName: exchangeFormCategory.trim() || undefined,
          brandName: exchangeFormBrand.trim() || undefined,
          costPrice: Number(exchangeFormCostPrice || 0),
          salePrice: Number(exchangeFormSellPrice || 0),
        }),
      });
      setExchangeItem({
        skuId: result.skuId,
        skuCode: result.skuCode,
        productName: exchangeFormName.trim(),
        category: exchangeFormCategory.trim(),
        brand: exchangeFormBrand.trim(),
        costPrice: Number(exchangeFormCostPrice || 0),
        salePrice: Number(exchangeFormSellPrice || 0),
        exchangeAmount: Number(exchangeFormCostPrice || 0),
      });
    } catch (error) {
      setMessage((error as Error).message);
    }
    setExchangeModalOpen(false);
  };

  const removeExchangeItem = () => {
    setExchangeItem(null);
  };

  const updateCartQty = (skuId: string, nextQty: number) => {
    setCart((current) =>
      current.map((item) =>
        item.skuId === skuId
          ? { ...item, qty: Math.max(1, Math.min(nextQty, Math.max(1, item.availableQty))) }
          : item,
      ),
    );
  };

  const updateCartDiscount = (skuId: string, discountAmount: number, discountType: string) => {
    setCart((current) =>
      current.map((item) =>
        item.skuId === skuId
          ? { ...item, discountAmount: Math.max(0, Math.min(discountAmount, item.qty * item.unitPrice)), discountType }
          : item,
      ),
    );
  };

  const removeFromCart = (skuId: string) => {
    const idx = cart.findIndex((i) => i.skuId === skuId);
    if (idx < 0) return;
    const removedItem = cart[idx];
    setLastRemoved({ item: { ...removedItem }, index: idx });
    setCart((prev) => prev.filter((i) => i.skuId !== skuId));
  };

  const updateCartPrice = (skuId: string, price: number) => {
    setCart((prev) => prev.map((item) => item.skuId === skuId
      ? { ...item, unitPrice: Math.max(price, 0) }
      : item));
  };

  const undoRemove = () => {
    if (!lastRemoved) return;
    setCart((prev) => {
      const next = [...prev];
      next.splice(Math.min(lastRemoved.index, next.length), 0, { ...lastRemoved.item });
      return next;
    });
    setLastRemoved(null);
  };

  const clearCart = () => {
    if (!cart.length) return;
    if (!window.confirm(t('Clear the cart?'))) return;
    setLastSoldCart([]);
    setCart([]);
    setLastRemoved(null);
    setMessage(t('Cart cleared.'));
  };

  const PARKED_KEY = 'parked_sales_v1';
  const readParked = (): typeof parkedSales => {
    try { return JSON.parse(localStorage.getItem(PARKED_KEY) || '[]'); } catch { return []; }
  };
  const writeParked = (list: NonNullable<typeof parkedSales>) => {
    localStorage.setItem(PARKED_KEY, JSON.stringify(list));
    setParkedSales(list);
  };

  const holdSale = () => {
    if (!cart.length) return;
    const list = readParked();
    const label = `${cart.length} item(s)${customerName || customerPhone ? ` — ${customerName || customerPhone}` : ''}`;
    list.push({
      id: `${Date.now()}`, ts: Date.now(), label, cart: cart.map((i) => ({ ...i })),
      customerName, customerPhone, customerEmail, customerShopName, customerAddress,
      saleMode, documentMode, dueDate,
    });
    writeParked(list);
    setCart([]);
    setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setCustomerShopName(''); setCustomerAddress('');
    setSaleMode('paid'); setLastRemoved(null);
    setMessage(t('Sale parked. Serve the next customer.'));
  };

  const resumeParked = (id: string) => {
    const list = readParked();
    const target = list.find((p) => p.id === id);
    if (!target) return;
    if (cart.length) holdSale();
    const rest = list.filter((p) => p.id !== id);
    writeParked(rest);
    setCart(target.cart.map((i) => ({ ...i })));
    setCustomerName(target.customerName); setCustomerPhone(target.customerPhone);
    setCustomerEmail(target.customerEmail); setCustomerShopName(target.customerShopName);
    setCustomerAddress(target.customerAddress);
    setSaleMode(target.saleMode); setDocumentMode(target.documentMode); setDueDate(target.dueDate);
    setLastRemoved(null);
    setMessage(t('Parked sale resumed.'));
  };

  const removeParked = (id: string) => {
    writeParked(readParked().filter((p) => p.id !== id));
  };

  const openShift = async () => {
    if (!selectedRegisterId) {
      setMessage('Select a register first.');
      return;
    }

    setLoading(true);
    try {
      const payload = await readJson<ShiftResponse>('/api/pos/shifts/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registerId: selectedRegisterId,
          openingCash: Number(openingCash || 0),
        }),
      });

      setRegisters((current) =>
        current.map((register) =>
          register.id === selectedRegisterId
            ? { ...register, open_shift_id: payload.shift?.id ?? null }
            : register,
        ),
      );
      setMessage('Shift opened successfully.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const closeShift = async () => {
    if (!openShiftId) {
      setMessage('No open shift found for this register.');
      return;
    }

    setLoading(true);
    try {
      await readJson<ShiftResponse>(`/api/pos/shifts/${openShiftId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          closingCash: Number(closingCash || 0),
        }),
      });
      setRegisters((current) =>
        current.map((register) =>
          register.id === selectedRegisterId ? { ...register, open_shift_id: null } : register,
        ),
      );
      setMessage('Shift closed successfully.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const checkout = async () => {
    if (!selectedLocationId) {
      setMessage('Select a stock location first.');
      return;
    }
    if (cart.length === 0) {
      setMessage('Add at least one item to the cart.');
      return;
    }
    if ((saleMode === 'due' || saleMode === 'cod') && !customerName.trim() && !customerPhone.trim()) {
      setMessage(`${saleMode === 'cod' ? 'Cash-on-delivery' : 'Due'} sales need a customer name or phone number.`);
      return;
    }
    if (exchangeEnabled && !exchangeItem) {
      setMessage('Select an exchange product first.');
      return;
    }
    if (usePartialPayments) {
      if (saleMode === 'paid' && totalPaidFromPartial < paymentRequired) {
        setMessage('Total payment is less than the required amount.');
        return;
      }
      if ((saleMode === 'due' || saleMode === 'cod') && totalPaidFromPartial > paymentRequired) {
        setMessage('Payment exceeds the total amount.');
        return;
      }
    } else if (saleMode === 'paid' && paymentMethod === 'cash' && Number(cashReceived || 0) < paymentRequired) {
      setMessage('Cash received is lower than the sale total.');
      return;
    }
    const invalidItem = cart.find((item) => item.availableQty < 999999 && (item.availableQty <= 0 || item.qty > item.availableQty));
    if (invalidItem) {
      setMessage(`${invalidItem.productName} does not have enough stock in the selected location.`);
      return;
    }
    const missingSerial = cart.find((item) => item.requiresSerial && (item.selectedSerials?.length ?? 0) !== item.qty);
    if (missingSerial) {
      setMessage(`${missingSerial.productName}: select ${missingSerial.qty} serial/IMEI before checkout.`);
      return;
    }

    setLoading(true);
    let saleBody: Record<string, unknown> | null = null;
    try {
      setLastSoldCart(cart.map((item) => ({ ...item })));
      const saleIsDue = saleMode === 'due';
      const saleIsCod = saleMode === 'cod';
      const saleIsPayableLater = saleIsDue || saleIsCod;
      const saleIsExchange = exchangeEnabled && !!exchangeItem;
      const clientRequestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sale-${Date.now()}`;
      clientRequestIdRef.current = clientRequestId;
      const salePayload = await readJson<SaleCreateResponse>('/api/pos/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': clientRequestId,
        },
        body: JSON.stringify((saleBody = {
          clientRequestId,
          locationId: selectedLocationId,
          registerId: selectedRegisterId || undefined,
          shiftId: SHOW_SHIFT_CONTROLS ? openShiftId || undefined : undefined,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          customerEmail: customerEmail || undefined,
          customerShopName: customerShopName || undefined,
          customerAddress: customerAddress || undefined,
          dueDate: saleIsPayableLater && dueDate ? dueDate : undefined,
          exchangeSkuId: saleIsExchange ? exchangeItem!.skuId : undefined,
          exchangeAmount: saleIsExchange ? exchangeItem!.exchangeAmount : 0,
          discountAmount: orderDiscountAmount,
          taxAmount: taxAmountValue,
          vatAmount: vatAmountValue,
          shippingAmount: deliveryChargeValue,
          items: cart.map((item) => ({
            skuId: item.skuId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            taxAmount: 0,
            serialIds: item.selectedSerials?.map((s) => s.serialId),
          })),
          payments: saleIsCod
            ? [
                ...(deliveryChargeValue > 0
                  ? [{
                      paymentMethod: advanceMethod,
                      amount: Math.min(deliveryChargeValue, paymentRequired),
                      referenceNo: paymentReference || undefined,
                      status: 'paid',
                    }]
                  : []),
                {
                  paymentMethod: 'cod',
                  amount: Math.max(paymentRequired - deliveryChargeValue, 0),
                  referenceNo: undefined,
                  status: 'pending',
                },
              ].filter((payment) => payment.amount > 0)
            : usePartialPayments
            ? (() => {
                const paid = (Object.entries(partialPayments) as Array<[string, { amount: string; reference: string }]>)
                  .filter(([, entry]) => Number(entry.amount) > 0)
                  .map(([method, entry]) => ({
                    paymentMethod: method,
                    amount: Number(entry.amount),
                    referenceNo: entry.reference || undefined,
                    status: 'paid',
                  }));
                return paid;
              })()
            : [
                {
                  paymentMethod,
                  amount: paymentRequired,
                  referenceNo: paymentReference || undefined,
                  status: saleIsDue ? 'pending' : 'paid',
                },
              ],
        })),
      });

      const saleId = salePayload.sale?.id;
      if (!saleId) {
        throw new Error('Sale saved but sale id is missing');
      }

      const useInvoiceDoc = canUseInvoices && documentMode === 'a4';
      const paperDoc = documentMode !== 'pos';
      const documentPayload = await readJson<ReprintResponse>(
        `/api/pos/sales/${saleId}/${useInvoiceDoc ? 'invoice' : 'reprint'}`,
        { method: 'POST' },
      );

      if (documentPayload.receipt) {
        setLastInvoice(documentPayload.receipt);
        setLastInvoiceMode(documentMode === 'a4' ? 'a4' : 'a5');
        setCollectAmount(Number(documentPayload.receipt.totals?.due || 0) > 0 ? String(Number(documentPayload.receipt.totals?.due)) : '');

        // The local print agent polls the backend for pending jobs and prints silently.
        // Browser-to-localhost fetch is blocked by mixed-content on hosted HTTPS origins.
        // A4 invoices always go through the browser print dialog (laser printer).
        const isLocalDev = typeof window !== 'undefined' &&
          ['localhost', '127.0.0.1'].includes(window.location.hostname);
        let printed = false;

        if (isLocalDev && !paperDoc) {
          try {
            await printReceipt(documentPayload.receipt, receiptPrinterName || undefined, agentUrl);
            printed = true;
            if (!saleIsDue && (usePartialPayments ? Number(partialPayments.cash?.amount || 0) > 0 : paymentMethod === 'cash')) {
              await openCashDrawer({ printerName: receiptPrinterName || undefined }, agentUrl).catch(() => {});
            }
          } catch { /* fall through */ }
        }

        if (printed) {
          setMessage(`${saleIsDue ? 'Due sale' : 'Sale'} ${salePayload.sale?.saleNo ?? ''} completed and receipt printed.`);
        } else {
          setInvoiceModalOpen(true);
          openInvoicePrintWindow(documentPayload.receipt, paperDoc ? documentMode : 'a5');
          setMessage(
            useInvoiceDoc
              ? `Invoice ${documentPayload.receipt.invoiceNo ?? salePayload.sale?.saleNo ?? ''} ready. Browser print dialog should open automatically.`
              : `Sale ${salePayload.sale?.saleNo ?? ''} completed. Browser print dialog should open automatically.`,
          );
        }
      }

      void syncOfflineSales();
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setCustomerShopName('');
      setCustomerAddress('');
      setCustomerLookup({ checking: false, matched: null });
      setCustomerPriceMap({});
      setCustomerOutstanding(null);
      setDueDate(new Date().toISOString().slice(0, 10));
      setSaleMode('paid');
      setExchangeEnabled(false);
      setPaymentMethod('cash');
      setPaymentReference('');
      setExchangeItem(null);
      setOrderDiscount('');
      setVatAmount('');
      setCashReceived('');
      setDeliveryCharge('');
      setAdvanceMethod('mfs');
      setUsePartialPayments(false);
      setSplitMethods(['cash']);
      setPartialPayments({ cash: { amount: '', reference: '' }, card: { amount: '', reference: '' }, mfs: { amount: '', reference: '' }, bank_transfer: { amount: '', reference: '' } });
      clearSearchState();
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (isNetworkError(errorMessage) && saleBody && clientRequestIdRef.current) {
        const list = readOfflineSales();
        list.push({ clientRequestId: clientRequestIdRef.current, body: saleBody, ts: Date.now() });
        writeOfflineSales(list);
        setOfflineQueueCount(list.length);
        setMessage(`No internet — sale saved offline. It will sync and print automatically when back online.`);
        toast.info('Sale saved offline — will sync automatically.');
      } else {
        setMessage(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const collectFromModal = async () => {
    const saleId = lastInvoice?.saleId;
    const amount = Number(collectAmount || 0);
    if (!saleId || !amount) {
      setMessage('Enter a collection amount first.');
      return;
    }
    setCollecting(true);
    try {
      const payload = await readJson<{ saleNo: string; outstandingAmount: number }>(
        `/api/store-ops/due-sales/${saleId}/collections`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, paymentMethod: collectMethod }),
        },
      );
      setLastInvoice((cur) => (cur
        ? { ...cur, totals: { ...cur.totals, paid: Number(cur.totals?.paid || 0) + amount, due: Math.max(Number(cur.totals?.due || 0) - amount, 0) } }
        : cur));
      setCollectAmount('');
      toast.success(`Collection posted for ${payload.saleNo} — remaining due ${payload.outstandingAmount.toFixed(2)}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCollecting(false);
    }
  };

  const repeatLastSale = () => {
    if (!lastSoldCart.length) return;
    setCart(lastSoldCart.map((item) => ({ ...item })));
    setInvoiceModalOpen(false);
    setMessage('Cart restored from the last sale — review and check out again.');
  };

  const handlePrintLabel = async (sku: SkuSearchResult) => {
    try {
      await printLabel({
        text: [
          sku.product_name,
          sku.sku_code,
          sku.barcode ? `Barcode: ${sku.barcode}` : null,
          `Price: ${currency(Number(sku.sale_price ?? 0))}`,
        ]
          .filter(Boolean)
          .join('\n'),
        printerName: labelPrinterName || undefined,
      }, agentUrl);
      setMessage(`Label sent for ${sku.sku_code}.`);
    } catch (error) {
      setMessage(`Label print failed: ${(error as Error).message}`);
    }
  };

  const handleOpenDrawer = async () => {
    try {
      await openCashDrawer({ printerName: receiptPrinterName || undefined }, agentUrl);
      setMessage('Cash drawer command sent.');
    } catch (error) {
      setMessage(`Cash drawer failed: ${(error as Error).message}`);
    }
  };

  const handlePrintInvoice = () => {
    if (!lastInvoice) return;
    openInvoicePrintWindow(lastInvoice, lastInvoiceMode);
  };

  if (!canUsePos) {
    return (
      <section style={{ display: 'grid', gap: 12 }}>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>POS access limited</h3>
          <p style={tokenMutedStyle}>Your role does not have permission to create sales or use the POS terminal.</p>
        </article>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {compact ? (
        <WorkspaceTabs
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'search' | 'cart' | 'checkout')}
          tabs={[
            { key: 'search', label: 'Search' },
            { key: 'cart', label: `Cart (${cart.length})` },
            { key: 'checkout', label: 'Checkout' },
          ]}
        />
      ) : null}
      <section style={{ ...sectionPanelStyle, gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.3fr) minmax(360px, 0.7fr)' }}>
        {(!compact || activeTab === 'search' || activeTab === 'cart') ? (
        <section style={{ display: 'grid', gridTemplateRows: compact ? 'auto minmax(420px, 1fr)' : 'auto minmax(360px, 1fr)', gap: 10 }}>
          {!compact || activeTab === 'search' ? (
          <article style={compactCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 14 }}>Product Search</h3>
                <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 12, lineHeight: 1.35 }}>
                  {t('Search by barcode, product or SKU.')}
                </p>
              </div>
              <div style={{ display: 'grid', gap: 2, fontSize: 11, color: 'var(--muted-foreground)', textAlign: 'right' }}>
                <div>Register: {selectedRegister?.name || 'Not selected'}</div>
                <div>Location: {locations.find((location) => location.id === selectedLocationId)?.name || 'Not selected'}</div>
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    ref={searchInputRef}
                    data-enter-nav="false"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onFocus={() => { if (groupedResults.length > 0) setShowSuggestions(true); }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    onKeyDown={(event) => {
                      const max = groupedResults.length - 1;
                      const scrollHighlight = (idx: number) => {
                        requestAnimationFrame(() => {
                          document.getElementById(`pos-result-${idx}`)?.scrollIntoView({ block: 'nearest' });
                        });
                      };
                      if (event.key === 'ArrowDown' && showSuggestions && max >= 0) {
                        event.preventDefault();
                        const next = Math.min(searchHighlight + 1, max);
                        setSearchHighlight(next);
                        scrollHighlight(next);
                        return;
                      }
                      if (event.key === 'ArrowUp' && showSuggestions && max >= 0) {
                        event.preventDefault();
                        const prev = Math.max(searchHighlight - 1, 0);
                        setSearchHighlight(prev);
                        scrollHighlight(prev);
                        return;
                      }
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (showSuggestions && groupedResults.length > 0) {
                          const group = groupedResults[Math.min(searchHighlight, max)];
                          if (group) {
                            setShowSuggestions(false);
                            openVariantPicker(group);
                          }
                        } else {
                          void searchCatalog(search.trim());
                        }
                        return;
                      }
                      if (event.key === 'Escape') {
                        setShowSuggestions(false);
                      }
                    }}
                    style={{ ...inputStyle, width: '100%' }}
                    placeholder={t('Scan barcode or search product / SKU')}
                  />
                  {searching ? (
                    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)', fontSize: 12 }}>
                      searching...
                    </span>
                  ) : null}
                </div>
                <button onClick={() => void searchCatalog(search.trim())} style={searchButtonStyle} disabled={loading}>
                  Search
                </button>
              </div>

              {showSuggestions && groupedResults.length > 0 ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '100%',
                    zIndex: 50,
                    marginTop: 4,
                    background: 'var(--card)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    maxHeight: 340,
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ padding: '5px 10px', fontSize: 10.5, color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                    ↑↓ {t('Select a product')} · Enter {t('Add')} — {t('first item is preselected')}
                  </div>
                  {groupedResults.map((group, gIdx) => {
                    if (group.hasVariants) {
                      return (
                        <div
                          key={group.productId}
                          id={`pos-result-${gIdx}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setShowSuggestions(false); openVariantPicker(group); }}
                          style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: searchHighlight === gIdx ? 'rgba(37,99,235,0.10)' : 'transparent', borderLeft: searchHighlight === gIdx ? '3px solid #2563eb' : '3px solid transparent' }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{group.productName}</div>
                            <div style={{ color: 'var(--muted-foreground)', fontSize: 12, marginTop: 2 }}>
                              {group.variantMode || 'variant'} · {group.skuCount} variant(s)
                              {' · '}Available: {formatQty(group.totalAvailable)}
                              {' · '}From {currency(group.lowestPrice)}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const singleSku = group.skus[0];
                    const singleTrackable = singleSku.is_trackable !== false;
                    const singleAvailable = !singleTrackable || getSkuAvailableQty(singleSku) > 0;
                    return (
                      <div
                        key={group.productId}
                        id={`pos-result-${gIdx}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setShowSuggestions(false); openVariantPicker(group); }}
                        style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: searchHighlight === gIdx ? 'rgba(37,99,235,0.10)' : 'transparent', borderLeft: searchHighlight === gIdx ? '3px solid #2563eb' : '3px solid transparent', opacity: singleAvailable ? 1 : 0.5 }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{group.productName}</div>
                          <div style={{ color: 'var(--muted-foreground)', fontSize: 12, marginTop: 2 }}>
                            {singleSku.sku_code}
                            {' · '}Available: {formatQty(group.totalAvailable)}
                            {' · '}From {currency(group.lowestPrice)}
                            {!singleAvailable ? ' · Out of Stock' : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </article>
          ) : null}

          {!compact || activeTab === 'cart' ? (
          <article style={{ ...cardStyle, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: compact ? 520 : 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 6 }}>Cart</h3>
                <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
                  {t('Add products to build the sale.')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={holdSale} style={secondaryButtonStyle} disabled={!cart.length} title={t('Park this sale and serve the next customer')}>
                  {t('Hold')}
                </button>
                <button onClick={clearCart} style={secondaryButtonStyle} disabled={!cart.length}>
                  {t('Clear')}
                </button>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', textAlign: 'right' }}>
                  {totalDiscount > 0 ? (
                    <div style={{ color: '#b45309' }}>Item Disc. -{currency(totalDiscount)}</div>
                  ) : null}
                  {orderDiscountAmount > 0 ? (
                    <div style={{ color: '#b45309' }}>Order Disc. -{currency(orderDiscountAmount)}</div>
                  ) : null}
                </div>
              </div>
            </div>
            {lastRemoved ? (
              <div style={{ marginBottom: 8, fontSize: 12, color: '#92400e', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 6, padding: '5px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{t('Removed')} {lastRemoved.item.productName}</span>
                <button onClick={undoRemove} style={{ ...subtleButtonStyle, fontSize: 11, color: '#2563eb' }}>{t('Undo')}</button>
              </div>
            ) : null}
            {parkedSales && parkedSales.length > 0 ? (
              <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{t('Parked')}:</span>
                {parkedSales.map((parked) => (
                  <span key={parked.id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 4px 2px 8px', background: 'var(--muted)' }}>
                    {parked.label}
                    <button onClick={() => resumeParked(parked.id)} style={{ ...subtleButtonStyle, fontSize: 10.5, padding: '1px 6px', color: '#2563eb' }}>{t('Resume')}</button>
                    <button onClick={() => removeParked(parked.id)} style={{ ...subtleButtonStyle, fontSize: 10.5, padding: '1px 6px', color: '#dc2626' }}>✕</button>
                  </span>
                ))}
              </div>
            ) : null}
            {cart.length ? (
              <div style={{ ...tableWrapStyle, height: '100%' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Item</th>
                      <th style={tableHeaderCellStyle}>Price</th>
                      <th style={tableHeaderCellStyle}>Qty</th>
                      <th style={tableHeaderCellStyle}>Disc</th>
                      <th style={tableHeaderCellStyle}>Total</th>
                      <th style={tableHeaderCellStyle}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.skuId}>
                        <td style={tableCellStyle}>
                          <div style={{ fontWeight: 600 }}>{item.productName}</div>
                          <div style={{ color: 'var(--muted-foreground)', marginTop: 4 }}>
                            {item.skuCode}
                            {item.variantLabel ? ` · ${item.variantLabel}` : ''}
                          </div>
                          {item.requiresSerial ? (
                            <div style={{ marginTop: 4 }}>
                              {item.selectedSerials && item.selectedSerials.length > 0 ? (
                                <span style={{ fontSize: 10, color: '#166534' }}>
                                  {item.selectedSerials.length} serial{item.selectedSerials.length > 1 ? 's' : ''}: {item.selectedSerials.map((s) => s.serialNumber).join(', ')}
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setSerialPickerSkuId(item.skuId);
                                    setSerialPickerSkuCode(item.skuCode);
                                    setSerialPickerProductName(item.productName);
                                    setSerialPickerPreferredId('');
                                    setSerialPickerCartIndex(cart.findIndex((c) => c.skuId === item.skuId));
                                    setSerialPickerOpen(true);
                                  }}
                                  style={{ ...subtleButtonStyle, fontSize: 10, padding: '2px 6px' }}
                                >
                                  Select serial / IMEI
                                </button>
                              )}
                            </div>
                          ) : null}
                        </td>
                        <td style={tableCellStyle}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateCartPrice(item.skuId, Number(e.target.value))}
                            style={{ ...inputStyle, width: 90, fontSize: 12, textAlign: 'right', padding: '2px 6px', fontFamily: 'monospace' }}
                            aria-label={`Price for ${item.productName}`}
                          />
                        </td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button onClick={() => updateCartQty(item.skuId, item.qty - 1)} style={buttonStyle}>-</button>
                            <span>{item.qty}{item.unit ? ` ${item.unit}` : ''}</span>
                            <button onClick={() => updateCartQty(item.skuId, item.qty + 1)} style={buttonStyle}>+</button>
                          </div>
                          {item.availableQty < 999999 && item.qty > item.availableQty ? (
                            <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>
                              {t('Only')} {formatQty(item.availableQty)} {t('in stock')}
                            </div>
                          ) : null}
                        </td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                              type="number"
                              min={0}
                              value={item.discountType === 'percentage' && item.discountAmount > 0 && item.unitPrice > 0
                                ? String(Math.round(item.discountAmount / item.unitPrice * 100))
                                : item.discountAmount > 0
                                  ? String(item.discountAmount)
                                  : ''}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                if (val <= 0) { updateCartDiscount(item.skuId, 0, 'none'); return; }
                                if (item.discountType === 'percentage') {
                                  updateCartDiscount(item.skuId, item.unitPrice * val / 100, 'percentage');
                                } else {
                                  updateCartDiscount(item.skuId, val, 'fixed');
                                }
                              }}
                              style={{ ...inputStyle, width: 64, fontSize: 11, textAlign: 'right', padding: '2px 4px' }}
                              placeholder="0"
                              aria-label={`Discount for ${item.productName}`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (item.discountType === 'none' || item.discountType === 'fixed') {
                                  const pct = item.unitPrice > 0 ? Math.round(item.discountAmount / item.unitPrice * 100) : 0;
                                  updateCartDiscount(item.skuId, item.unitPrice * pct / 100, 'percentage');
                                } else {
                                  updateCartDiscount(item.skuId, item.discountAmount, 'fixed');
                                }
                              }}
                              style={{ ...subtleButtonStyle, fontSize: 10, padding: '2px 6px', fontWeight: 600 }}
                              title={t('Toggle between % and fixed amount')}
                            >
                              {item.discountType === 'percentage' ? '%' : '৳'}
                            </button>
                          </div>
                        </td>
                        <td style={tableCellStyle}>
                          <div>{currency(item.qty * item.unitPrice - item.discountAmount)}</div>
                          {item.discountAmount > 0 ? (
                            <div style={{ fontSize: 10, color: '#b45309' }}>-{currency(item.discountAmount)}</div>
                          ) : null}
                        </td>
                        <td style={tableCellStyle}>
                          <button onClick={() => removeFromCart(item.skuId)} style={buttonStyle}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted-foreground)', fontSize: 13 }}>
                {t('Cart is empty. Scan or search a product to start the sale.')}
              </div>
            )}
          </article>
          ) : null}
        </section>
        ) : null}

        {(!compact || activeTab === 'checkout') ? (
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>{t('Checkout')}</h3>
          {offlineQueueCount > 0 ? (
            <div style={{ marginBottom: 8, fontSize: 11.5, color: '#92400e', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 6, padding: '5px 8px' }}>
              {offlineQueueCount} offline sale(s) waiting — they will sync and print automatically when internet returns.
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder={saleMode !== 'paid' ? t('Customer mobile number (recommended)') : t('Customer mobile number (optional)')} />
              <button
                onClick={() => setCustomerExpanded((v) => !v)}
                style={{ ...subtleButtonStyle, fontSize: 11, whiteSpace: 'nowrap', minHeight: 32 }}
              >
                {customerExpanded || saleMode !== 'paid' ? t('Hide details') : t('+ Details')}
              </button>
            </div>
            {customerLookup.checking && customerPhone.replace(/\D/g, '').length >= 6 ? (
              <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: -4 }}>Looking up customer…</div>
            ) : null}
            {customerLookup.matched ? (
              <div style={{ fontSize: 11, color: '#166534', marginTop: -4, background: 'rgba(22,163,74,0.08)', padding: '4px 8px', borderRadius: 6 }}>
                ✓ Known customer{customerLookup.matched.name ? ` — ${customerLookup.matched.name}` : ''} — details autofilled
              </div>
            ) : null}
            {Object.keys(customerPriceMap).length > 0 ? (
              <div style={{ fontSize: 11, color: '#1e40af', marginTop: -4, background: 'rgba(37,99,235,0.08)', padding: '4px 8px', borderRadius: 6 }}>
                ✓ Customer price list active — {Object.keys(customerPriceMap).length} special rate(s) applied
              </div>
            ) : null}
            {(customerExpanded || saleMode !== 'paid') ? (<>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} style={inputStyle} placeholder={t('Customer name (optional)')} />
            <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} style={inputStyle} placeholder={t('Customer email (optional)')} />
            <input value={customerShopName} onChange={(event) => setCustomerShopName(event.target.value)} style={inputStyle} placeholder={saleMode !== 'paid' ? t('Shop name (optional but helpful)') : t('Shop name (optional)')} />
            <textarea value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} style={{ ...inputStyle, minHeight: 76 }} placeholder={saleMode !== 'paid' ? t('Shop / customer address for due tracking') : t('Customer address (optional)')} />
            </>) : null}
            {saleMode !== 'paid' ? (
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} style={inputStyle} aria-label={saleMode === 'cod' ? 'Expected delivery date' : 'Due date'} />
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <select
              aria-label="Sale mode"
              value={saleMode}
              onChange={(event) => setSaleMode(event.target.value as 'paid' | 'due' | 'cod')}
              style={inputStyle}
            >
              <option value="paid">{t('Cash sale')}</option>
              <option value="due">{t('Due sale')}</option>
              {canUseInvoices ? <option value="cod">{t('Cash on delivery')}</option> : null}
            </select>
            {canUseInvoices ? (
              <select
                aria-label="Invoice document"
                value={documentMode}
                onChange={(event) => setDocumentMode(event.target.value as 'pos' | 'a5' | 'a4')}
                style={inputStyle}
              >
                <option value="pos">POS receipt (thermal)</option>
                <option value="a5">{t('A5 receipt (laser)')}</option>
                <option value="a4">{t('A4 invoice (laser)')}</option>
              </select>
            ) : null}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={exchangeEnabled} onChange={(e) => { setExchangeEnabled(e.target.checked); if (!e.target.checked) { setExchangeItem(null); } if (e.target.checked) { openExchangeModal(); } }} style={{ accentColor: '#0f172a' }} />
              <span style={{ color: 'var(--muted-foreground)' }}>{t('Exchange / Trade-in')}</span>
            </label>
          </div>

          {exchangeEnabled && exchangeItem ? (
            <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(22,163,74,0.08)', borderRadius: 6, border: '1px solid rgba(22,163,74,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{exchangeItem.productName}</span>
                  <span style={{ color: 'var(--muted-foreground)', marginLeft: 6 }}>({exchangeItem.skuCode})</span>
                  <span style={{ color: '#16a34a', fontWeight: 600, marginLeft: 6 }}>-{currency(exchangeItem.exchangeAmount)}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={openExchangeModal} style={{ ...subtleButtonStyle, fontSize: 11 }}>Edit</button>
                  <button onClick={removeExchangeItem} style={{ ...subtleButtonStyle, fontSize: 11, color: '#dc2626' }}>Remove</button>
                </div>
              </div>
            </div>
          ) : exchangeEnabled && !exchangeItem ? (
            <div style={{ marginBottom: 12 }}>
              <button onClick={openExchangeModal} style={{ ...subtleButtonStyle, width: '100%', fontSize: 12, padding: '6px 10px', border: '1px dashed var(--border)', borderRadius: 6 }}>
                + Add Exchange / Trade-in Product
              </button>
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('Subtotal')}</span>
              <strong>{currency(total)}</strong>
            </div>
            {exchangeEnabled && exchangeItem ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                <span>Exchange: {exchangeItem.productName}</span>
                <strong>-{currency(exchangeItem.costPrice)}</strong>
              </div>
            ) : null}
            {totalDiscount > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309' }}>
                <span>Item Discount</span>
                <strong>-{currency(totalDiscount)}</strong>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>{t('Discount')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={orderDiscount}
                onChange={(e) => setOrderDiscount(e.target.value)}
                style={{ ...inputStyle, width: 100, fontSize: 12, textAlign: 'right', padding: '4px 8px' }}
                placeholder="0.00"
              />
            </div>
            {(showTaxFields || Number(vatAmount || 0) > 0 || Number(taxAmount || 0) > 0) ? (<>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>{t('VAT')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={vatAmount}
                onChange={(e) => setVatAmount(e.target.value)}
                style={{ ...inputStyle, width: 100, fontSize: 12, textAlign: 'right', padding: '4px 8px' }}
                placeholder="0.00"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>{t('Tax')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                style={{ ...inputStyle, width: 100, fontSize: 12, textAlign: 'right', padding: '4px 8px' }}
                placeholder="0.00"
              />
            </div>
            </>) : (
              <button type="button" onClick={() => setShowTaxFields(true)} style={{ ...subtleButtonStyle, fontSize: 11, width: '100%', justifyContent: 'flex-start' }}>
                + {t('VAT / Tax')}
              </button>
            )}
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>{t('Delivery charge')}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                  style={{ ...inputStyle, width: 100, fontSize: 12, textAlign: 'right', padding: '4px 8px' }}
                  placeholder="0.00"
                  aria-label="Delivery charge"
                />
              </div>
              {saleMode === 'cod' && deliveryChargeValue > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted-foreground)' }}>
                  <span>{t('Taken in advance from customer')}</span>
                  <select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value as 'cash' | 'mfs' | 'bank_transfer')} style={{ ...inputStyle, width: 110, fontSize: 11, padding: '2px 6px', minHeight: 24 }} aria-label="Advance payment method">
                    <option value="mfs">{t('MFS (bKash)')}</option>
                    <option value="cash">{t('Cash')}</option>
                    <option value="bank_transfer">{t('Bank')}</option>
                  </select>
                </div>
              ) : null}
            </div>
            {saleMode !== 'paid' && customerOutstanding !== null && customerOutstanding > 0 ? (
              <div style={{ fontSize: 12, color: '#92400e', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 6, padding: '5px 8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('Existing dues')}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>BDT {customerOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <span>{t('Net Payable')}</span>
              <strong>{currency(paymentRequired)}</strong>
            </div>
          </div>

          {!usePartialPayments && saleMode !== 'cod' ? (
            <div style={{ marginBottom: 12 }}>
              <select
                aria-label="Payment method"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'card' | 'mfs' | 'bank_transfer')}
                style={inputStyle}
              >
                <option value="cash">{t('Cash')}</option>
                <option value="card">Card</option>
                <option value="mfs">{t('MFS')}</option>
                <option value="bank_transfer">{t('Bank')}</option>
              </select>
            </div>
          ) : null}

          {saleMode !== 'cod' ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={usePartialPayments} onChange={(e) => { setUsePartialPayments(e.target.checked); if (e.target.checked && !splitMethods.length) setSplitMethods(['cash']); }} style={{ accentColor: '#0f172a' }} />
            <span style={{ color: 'var(--muted-foreground)' }}>{t('Split payment across multiple methods')}</span>
          </label>
          ) : null}

          {saleMode !== 'cod' && usePartialPayments ? (
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {splitMethods.map((method) => {
                const entry = partialPayments[method];
                return (
                  <div key={method} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ minWidth: 90, fontSize: 13, fontWeight: 500, color: 'var(--muted-foreground)' }}>
                      {method === 'bank_transfer' ? t('Bank') : method === 'mfs' ? t('MFS') : method === 'cash' ? t('Cash') : t('Card')}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={entry?.amount || ''}
                      onChange={(e) => setPartialPayments((cur) => ({ ...cur, [method]: { ...cur[method], amount: e.target.value } }))}
                      style={{ ...inputStyle, width: 120 }}
                      placeholder="Amount"
                    />
                    <input
                      value={entry?.reference || ''}
                      onChange={(e) => setPartialPayments((cur) => ({ ...cur, [method]: { ...cur[method], reference: e.target.value } }))}
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder="Reference (optional)"
                    />
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {(['cash', 'card', 'mfs', 'bank_transfer'] as const).filter((m) => !splitMethods.includes(m)).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setSplitMethods((cur) => [...cur, method])}
                    style={{ ...subtleButtonStyle, fontSize: 11 }}
                  >
                    + {method === 'bank_transfer' ? t('Bank') : method === 'mfs' ? t('MFS') : method === 'cash' ? t('Cash') : t('Card')}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 13, color: 'var(--muted-foreground)' }}>
                {t('Total')}: <strong style={{ marginLeft: 4, color: totalPaidFromPartial >= paymentRequired ? '#16a34a' : '#b45309' }}>{currency(totalPaidFromPartial)}</strong>
                <span style={{ margin: '0 4px' }}>/</span>
                Required: <strong style={{ marginLeft: 4 }}>{currency(paymentRequired)}</strong>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                style={inputStyle}
                placeholder={paymentMethod === 'cash' ? t('Payment note (optional)') : t('Reference no / transaction id')}
              />
            </div>
          )}

          {saleMode === 'paid' ? (
            usePartialPayments ? (
              changeAmount > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span>{t('Change due')}</span>
                  <strong>{currency(changeAmount)}</strong>
                </div>
              ) : null
            ) : paymentMethod === 'cash' ? (
              <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[500, 1000, 2000].map((note) => (
                    <button key={note} type="button" onClick={() => setCashReceived(String(Number(cashReceived || 0) + note))} style={{ ...subtleButtonStyle, fontSize: 11.5 }}>
                      +{note.toLocaleString()}
                    </button>
                  ))}
                  <button type="button" onClick={() => setCashReceived(String(Math.ceil(paymentRequired / 500) * 500))} style={{ ...subtleButtonStyle, fontSize: 11.5 }}>
                    {t('Round up')}
                  </button>
                  <button type="button" onClick={() => setCashReceived(String(paymentRequired))} style={{ ...subtleButtonStyle, fontSize: 11.5 }}>
                    {t('Exact')}
                  </button>
                </div>
                <input
                  value={cashReceived}
                  onChange={(event) => setCashReceived(event.target.value)}
                  style={inputStyle}
                  placeholder={`Amount paid by customer (${currency(paymentRequired)} required)`}
                />
                {changeAmount > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t('Change due')}</span>
                    <strong>{currency(changeAmount)}</strong>
                  </div>
                ) : null}
              </div>
            ) : null
          ) : null}
          {saleMode !== 'paid' ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted-foreground)', marginBottom: 12 }}>
              <span>{saleMode === 'cod' ? t('Payable on delivery') : t('Due amount')}</span>
              <strong>{currency(usePartialPayments ? Math.max(paymentRequired - totalPaidFromPartial, 0) : paymentRequired)}</strong>
            </div>
          ) : null}
            <button onClick={checkout} style={{ ...gray800ButtonStyle, width: '100%', minHeight: 44, fontSize: 14, fontWeight: 600, position: 'sticky', bottom: 8, zIndex: 5 }} disabled={loading || cart.length === 0 || !selectedLocationId || (exchangeEnabled && !exchangeItem)}>
              {saleMode === 'due' ? t('Save Due Sale') : saleMode === 'cod' ? t('Save COD Sale') : t('Complete Sale')}
            </button>
            {!selectedLocationId ? (
              <div style={{ fontSize: 12, color: '#b45309' }}>
                Select a stock location below before completing the sale.
              </div>
            ) : null}
        </article>
        ) : null}
      </section>

      {variantPickerOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
          onClick={() => setVariantPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--card)', borderRadius: 6,
              width: '90%', maxWidth: 896, height: '75vh', maxHeight: 672,
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 0', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{variantProduct?.product.name || 'Choose variant'}</h2>
                <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--muted-foreground)' }}>
                  {variantPickerHint || 'Select the exact variant before adding it to the cart.'}
                </p>
              </div>
              <button
                onClick={() => setVariantPickerOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 18, color: 'var(--muted-foreground)', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: '16px 24px 24px', overflow: 'auto', flex: 1 }}>
              {variantProduct?.skus?.length ? (
                <div style={{ display: 'grid', gap: 6, marginBottom: 12, maxHeight: 260, overflowY: 'auto' }}>
                  {variantProduct.skus.map((sku) => {
                    const skuIsTrackable = variantProduct.product.is_trackable;
                    const skuNeedsSerial = needsSerialTracking(sku);
                    const skuAvailable = (!skuIsTrackable && !skuNeedsSerial) || getSkuAvailableQty(sku) > 0;
                    const selected = pickerSkuId === sku.id;
                    const attrs = Object.entries((sku as any).variant_json ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
                    return (
                      <button
                        key={sku.id}
                        type="button"
                        disabled={!skuAvailable}
                        onClick={() => setPickerSkuId(sku.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', textAlign: 'left',
                          borderRadius: 6, cursor: skuAvailable ? 'pointer' : 'default',
                          border: selected ? '2px solid #2563eb' : '1px solid var(--border)',
                          background: selected ? 'rgba(37,99,235,0.08)' : 'transparent',
                          opacity: skuAvailable ? 1 : 0.5,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{sku.variant_label || 'Default'}</div>
                          {attrs.length ? (
                            <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)', marginTop: 2 }}>
                              {attrs.map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
                            </div>
                          ) : null}
                          <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)', marginTop: 2 }}>
                            {sku.sku_code} · {(skuIsTrackable || skuNeedsSerial) ? `${t('Available')}: ${formatQty(sku.available_qty)}` : t('In stock')}
                          </div>
                        </div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                          {currency(Number(sku.sale_price ?? 0))}
                        </div>
                        {selected ? <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 700 }}>✓</div> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={tokenMutedStyle}>No variants loaded for this product yet.</div>
              )}

              {pickerSkuId ? (
                <div style={{ display: 'grid', gap: 10, padding: 10, background: 'var(--muted)', borderRadius: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('Quantity')}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button type="button" onClick={() => setPickerQty((v) => String(Math.max(Number(v || 1) - 1, 1)))} style={{ ...subtleButtonStyle, width: 30 }}>−</button>
                        <input
                          data-enter-nav="false"
                          type="number" min="1" step="1"
                          value={pickerQty}
                          onChange={(e) => setPickerQty(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmPickerAdd(); } }}
                          style={{ ...fieldStyle, width: 80, textAlign: 'center' }}
                          aria-label={t('Quantity')}
                        />
                        <button type="button" onClick={() => setPickerQty((v) => String(Number(v || 0) + 1))} style={{ ...subtleButtonStyle, width: 30 }}>+</button>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('Discount (optional)')}</label>
                      <input
                        data-enter-nav="false"
                        type="number" min="0" step="0.01"
                        value={pickerDiscount}
                        onChange={(e) => setPickerDiscount(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmPickerAdd(); } }}
                        style={{ ...fieldStyle }}
                        placeholder="0.00"
                        aria-label={t('Discount (optional)')}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
                    <span>{t('Line Total')}</span>
                    <span style={{ fontFamily: 'monospace' }}>{pickerLineTotal}</span>
                  </div>
                  <button type="button" onClick={confirmPickerAdd} style={gray800ButtonStyle}>
                    {t('Add to Cart')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <SerialPickerModal
        open={serialPickerOpen}
        skuId={serialPickerSkuId}
        skuCode={serialPickerSkuCode}
        productName={serialPickerProductName}
        preferredSerialId={serialPickerPreferredId}
        onSelect={(serials) => {
          setCart((prev) => prev.map((item, idx) => {
            if (idx === serialPickerCartIndex) {
              return { ...item, selectedSerials: serials };
            }
            return item;
          }));
        }}
        onClose={() => {
          setSerialPickerOpen(false);
          setSerialPickerPreferredId('');
        }}
      />

      {exchangeModalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
          onClick={() => setExchangeModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--card)', borderRadius: 6,
              width: '90%', maxWidth: 420,
              padding: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Exchange / Trade-in Product</h2>
            <p style={{ margin: '4px 0 16px', fontSize: 14, color: 'var(--muted-foreground)' }}>
              Enter the product details accepted as trade-in.
            </p>

            <div style={{ display: 'grid', gap: 10 }}>
              <input
                value={exchangeFormName}
                onChange={(e) => setExchangeFormName(e.target.value)}
                style={inputStyle}
                placeholder="Product name (required)"
              />
              <select
                value={exchangeFormCategory}
                onChange={(e) => setExchangeFormCategory(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">-- Select category --</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
              <select
                value={exchangeFormBrand}
                onChange={(e) => setExchangeFormBrand(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">-- Select brand --</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={exchangeFormCostPrice}
                onChange={(e) => setExchangeFormCostPrice(e.target.value)}
                style={inputStyle}
                placeholder="Cost price (BDT)"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={exchangeFormSellPrice}
                onChange={(e) => setExchangeFormSellPrice(e.target.value)}
                style={inputStyle}
                placeholder="Sell price (BDT)"
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setExchangeModalOpen(false)} style={neutralButtonStyle}>
                Cancel
              </button>
              <button onClick={() => void saveExchangeItem()} style={gray800ButtonStyle} disabled={!exchangeFormName.trim()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <Sheet open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
        <SheetContent side="bottom" className="sm:max-w-full sm:max-h-[90vh] overflow-auto">
          <SheetHeader>
            <SheetTitle>{lastInvoice?.invoiceNo ? 'Invoice' : 'Receipt'} {lastInvoice?.invoiceNo || lastInvoice?.saleNo || ''}</SheetTitle>
            <SheetDescription>
              Printer unavailable. Review the invoice and print using your browser.
            </SheetDescription>
          </SheetHeader>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                if (lastInvoice) {
                  openInvoicePrintWindow(lastInvoice, lastInvoiceMode);
                }
              }}
              style={primaryButtonStyle}
            >
              {lastInvoiceMode === 'a4' ? 'Print A4 Invoice' : 'Print A5 Receipt'}
            </button>
            <button
              onClick={() => {
                if (lastInvoice) {
                  downloadReceiptHtml(lastInvoice, lastInvoiceMode);
                }
              }}
              style={secondaryButtonStyle}
            >
              Download
            </button>
            <button onClick={repeatLastSale} style={secondaryButtonStyle} disabled={!lastSoldCart.length}>
              Repeat Sale
            </button>
            <button onClick={() => setInvoiceModalOpen(false)} style={neutralButtonStyle}>
              Close
            </button>
          </div>
          {lastInvoice?.saleId && Number(lastInvoice.totals?.due || 0) > 0 ? (
            <div style={{ marginTop: 12, padding: 10, border: '1px solid rgba(217,119,6,0.35)', borderRadius: 6, display: 'grid', gap: 8, background: 'rgba(217,119,6,0.06)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Collect payment — due {currency(Number(lastInvoice.totals?.due || 0))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={collectAmount}
                  onChange={(event) => setCollectAmount(event.target.value)}
                  placeholder="Amount"
                  aria-label="Collection amount"
                  style={{ ...inputStyle, width: 140 }}
                />
                <select value={collectMethod} onChange={(event) => setCollectMethod(event.target.value)} aria-label="Collection method" style={{ ...inputStyle, width: 140 }}>
                  <option value="cash">{t('Cash')}</option>
                  <option value="card">Card</option>
                  <option value="mfs">{t('MFS')}</option>
                  <option value="bank_transfer">{t('Bank')}</option>
                </select>
                <button onClick={() => void collectFromModal()} style={primaryButtonStyle} disabled={collecting || !Number(collectAmount)}>
                  {collecting ? 'Posting…' : 'Post Collection'}
                </button>
              </div>
            </div>
          ) : null}
          {lastInvoice ? (
            <div
              id="pos-invoice-sheet-preview"
              style={{ marginTop: 10, background: '#fff', overflow: 'auto' }}
              dangerouslySetInnerHTML={{ __html: invoiceSheetPreview }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <article style={{ ...cardStyle, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Workstation</h4>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: printError ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: printError ? '#dc2626' : '#16a34a' }}>
              {printError ? 'Offline' : 'Ready'}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted-foreground)', display: 'grid', gap: 4 }}>
            <div>Receipt: {printHealth?.printerName || receiptPrinterName || 'Not set'}</div>
            <div>Label: {printHealth?.labelPrinterName || labelPrinterName || 'Not set'}</div>
            <div style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>{agentUrl}</div>
            {printError ? (
              <div style={{ color: '#b45309', fontSize: 11 }}>
                Printing is optional here. If the local agent is unavailable, the sale still completes and falls back to invoice preview.
              </div>
            ) : null}
          </div>
          <button onClick={handleOpenDrawer} style={{ ...subtleButtonStyle, marginTop: 8 }} disabled={Boolean(printError)}>
            Test Cash Drawer
          </button>
        </article>

        <article style={{ ...cardStyle, padding: 14 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Register</h4>
          <select aria-label="Register" value={selectedRegisterId} onChange={(event) => setSelectedRegisterId(event.target.value)} style={{ ...inputStyle, marginTop: 8, fontSize: 12 }}>
            <option value="">Select register</option>
            {registers.map((register) => (
              <option key={register.id} value={register.id}>{register.code} — {register.name}</option>
            ))}
          </select>
          {!SHOW_SHIFT_CONTROLS ? (
            <p style={{ marginTop: 8, marginBottom: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>
              Shift controls are hidden for now.
            </p>
          ) : null}
          {SHOW_SHIFT_CONTROLS ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} style={{ ...inputStyle, fontSize: 12 }} placeholder="Opening cash" />
              <button onClick={openShift} style={accentButtonStyle} disabled={loading || Boolean(openShiftId)}>Open</button>
            </div>
          ) : null}
        </article>

        <article style={{ ...cardStyle, padding: 14 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Stock Source</h4>
          <select aria-label="Stock source" value={selectedLocationId} onChange={(event) => { setSelectedLocationId(event.target.value); localStorage.setItem('pos_location_id', event.target.value); }} style={{ ...inputStyle, marginTop: 8, fontSize: 12 }}>
            <option value="">Select location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.code} — {location.name}</option>
            ))}
          </select>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>
            Barcode scanners type into the search field above.
          </p>
        </article>
      </section>

      
<article style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Last Sale</h3>
        <p style={{ marginTop: 0, color: 'var(--muted-foreground)' }}>{message}</p>
        {lastInvoice ? (
          <div style={{ marginBottom: 10, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <strong>Latest invoice preview</strong>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  {(['a4', 'a5'] as const).map((paper) => (
                    <button
                      key={paper}
                      type="button"
                      onClick={() => setLastInvoiceMode(paper)}
                      aria-pressed={lastInvoiceMode === paper}
                      style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                        background: lastInvoiceMode === paper ? 'var(--primary)' : 'transparent',
                        color: lastInvoiceMode === paper ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                      }}
                    >
                      {paper.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button onClick={() => lastInvoice && downloadReceiptHtml(lastInvoice, lastInvoiceMode)} style={{ ...buttonStyle, fontSize: 11 }}>
                  Download
                </button>
                <button onClick={handlePrintInvoice} style={buttonStyle}>
                  {lastInvoiceMode === 'a4' ? 'Print A4' : 'Print A5'}
                </button>
              </div>
            </div>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: '#fff',
                maxHeight: 520,
                overflow: 'auto',
              }}
            >
              <div
                id="pos-invoice-notes-preview"
                style={{ minWidth: PAPER_WIDTH_PX[lastInvoiceMode], background: '#fff' }}
                dangerouslySetInnerHTML={{ __html: invoiceNotesPreview }}
              />
            </div>
            <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
              {canUseInvoices ? 'Thank you for your business' : 'Developed and maintained by Merch Flow'}
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
}
