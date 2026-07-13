'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_PRINT_AGENT_URL,
  fetchPrintAgentHealth,
  openCashDrawer,
  openInvoicePrintWindow,
  printLabel,
  printReceipt,
  renderInvoiceHtml,
  type PrintAgentHealth,
  type ReceiptPayload,
} from '../../lib/print-agent';
import { loadWorkstationProfile } from '../../lib/workstation-profile';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
} from '../marketone-theme';
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
  has_variants?: boolean;
  variant_mode?: string | null;
  is_trackable?: boolean;
  sale_price?: string | number | null;
  available_qty?: string | number | null;
  discount_type?: string | null;
  discount_value?: string | number | null;
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
    sale_price?: string | number | null;
    available_qty?: string | number | null;
    status: string;
  }>;
};

type CartItem = {
  skuId: string;
  skuCode: string;
  productName: string;
  variantLabel?: string | null;
  unitPrice: number;
  qty: number;
  availableQty: number;
  barcode?: string | null;
  discountAmount: number;
  discountType: string;
};

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

function isLoopbackAgent(url: string) {
  return url.includes('127.0.0.1') || url.includes('localhost');
}

function getSkuAvailableQty(sku: Pick<SkuSearchResult, 'available_qty'> | Pick<ProductVariantDetail['skus'][number], 'available_qty'>) {
  return Number(sku.available_qty ?? 0);
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

export function PosTerminal({ canUsePos }: { canUsePos: boolean }) {
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
  const [dueDate, setDueDate] = useState('');
  const [saleMode, setSaleMode] = useState<'paid' | 'due' | 'exchange'>('paid');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mfs' | 'bank_transfer'>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [exchangeItem, setExchangeItem] = useState<{ skuId: string; skuCode: string; productName: string; exchangeAmount: number } | null>(null);
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [exchangeResults, setExchangeResults] = useState<SkuSearchResult[]>([]);
  const [exchangeSearching, setExchangeSearching] = useState(false);
  const exchangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('0');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('POS ready for barcode-first checkout.');
  const [printHealth, setPrintHealth] = useState<PrintAgentHealth | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [lastReceiptText, setLastReceiptText] = useState('');
  const [lastInvoice, setLastInvoice] = useState<ReceiptPayload | null>(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [receiptPrinterName, setReceiptPrinterName] = useState('');
  const [labelPrinterName, setLabelPrinterName] = useState('');
  const [agentUrl, setAgentUrl] = useState(DEFAULT_PRINT_AGENT_URL);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'cart' | 'checkout'>('search');

  useEffect(() => {
    void Promise.all([
      readJson<{ registers: Register[] }>('/api/pos/registers'),
      readJson<{ locations: Location[] }>('/api/pos/locations'),
    ])
      .then(([registerPayload, locationPayload]) => {
        setRegisters(registerPayload.registers ?? []);
        setLocations(locationPayload.locations ?? []);
        setSelectedRegisterId(registerPayload.registers?.[0]?.id ?? '');
        setSelectedLocationId(locationPayload.locations?.[0]?.id ?? '');
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

  const grandTotal = useMemo(
    () => Math.max(total - totalDiscount, 0),
    [total, totalDiscount],
  );

  const exchangeAmount = exchangeItem?.exchangeAmount ?? 0;
  const amountAfterExchange = useMemo(() => Math.max(grandTotal - exchangeAmount, 0), [grandTotal, exchangeAmount]);

  const changeAmount = useMemo(() => {
    if (paymentMethod !== 'cash') return 0;
    if (saleMode !== 'paid' && saleMode !== 'exchange') return 0;
    const paid = Number(cashReceived || 0);
    const required = saleMode === 'exchange' ? amountAfterExchange : grandTotal;
    return Math.max(paid - required, 0);
  }, [cashReceived, paymentMethod, saleMode, grandTotal, amountAfterExchange]);

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
        sale_price: sku.sale_price,
        available_qty: sku.available_qty,
        status: 'active',
      })),
    });
    setVariantPickerHint(hint);
    setVariantPickerOpen(true);
  };

  const addSkuToCart = (sku: Pick<SkuSearchResult, 'id' | 'sku_code' | 'product_name' | 'variant_label' | 'sale_price' | 'available_qty' | 'barcode' | 'is_trackable' | 'discount_type' | 'discount_value'>, discountOverride?: { discountAmount: number; discountType: string }) => {
    const isTrackable = sku.is_trackable !== false;
    const availableQty = isTrackable ? getSkuAvailableQty(sku) : 999999;
    if (isTrackable && availableQty <= 0) {
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

      const unitPrice = Number(sku.sale_price ?? 0);
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
          variantLabel: sku.variant_label,
          unitPrice,
          qty: 1,
          availableQty,
          barcode: sku.barcode,
          discountAmount,
          discountType,
        },
      ];
    });
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

  // ── Exchange product search ──

  const searchExchangeProducts = async (q: string) => {
    if (!q.trim()) { setExchangeResults([]); return; }
    setExchangeSearching(true);
    try {
      const payload = await readJson<{ skus: SkuSearchResult[] }>(`/api/pos/search?q=${encodeURIComponent(q.trim())}&limit=10&productType=exchange`);
      setExchangeResults(payload.skus ?? []);
    } catch { /* ignore */ }
    finally { setExchangeSearching(false); }
  };

  useEffect(() => {
    if (exchangeDebounceRef.current) clearTimeout(exchangeDebounceRef.current);
    if (!exchangeSearch.trim()) { setExchangeResults([]); setExchangeSearching(false); return; }
    setExchangeSearching(true);
    exchangeDebounceRef.current = setTimeout(() => { void searchExchangeProducts(exchangeSearch.trim()); }, 150);
    return () => { if (exchangeDebounceRef.current) clearTimeout(exchangeDebounceRef.current); };
  }, [exchangeSearch]);

  const selectExchangeItem = (sku: SkuSearchResult) => {
    setExchangeItem({
      skuId: sku.id,
      skuCode: sku.sku_code,
      productName: sku.product_name,
      exchangeAmount: Number(sku.sale_price ?? 0),
    });
    setExchangeSearch('');
    setExchangeResults([]);
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
    setCart((current) => current.filter((item) => item.skuId !== skuId));
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
    if (saleMode === 'due' && !customerName.trim() && !customerPhone.trim()) {
      setMessage('Due sales need a customer name or phone number.');
      return;
    }
    if (saleMode === 'exchange' && !exchangeItem) {
      setMessage('Select an exchange product first.');
      return;
    }
    const paymentRequired = saleMode === 'exchange' ? amountAfterExchange : grandTotal;
    if (saleMode === 'paid' && paymentMethod === 'cash' && Number(cashReceived || 0) < paymentRequired) {
      setMessage('Cash received is lower than the sale total.');
      return;
    }
    const invalidItem = cart.find((item) => item.availableQty < 999999 && (item.availableQty <= 0 || item.qty > item.availableQty));
    if (invalidItem) {
      setMessage(`${invalidItem.productName} does not have enough stock in the selected location.`);
      return;
    }

    setLoading(true);
    try {
      const saleIsDue = saleMode === 'due';
      const saleIsExchange = saleMode === 'exchange';
      const clientRequestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sale-${Date.now()}`;
      const salePayload = await readJson<SaleCreateResponse>('/api/pos/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': clientRequestId,
        },
        body: JSON.stringify({
          clientRequestId,
          locationId: selectedLocationId,
          registerId: selectedRegisterId || undefined,
          shiftId: SHOW_SHIFT_CONTROLS ? openShiftId || undefined : undefined,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          customerEmail: customerEmail || undefined,
          customerShopName: customerShopName || undefined,
          customerAddress: customerAddress || undefined,
          dueDate: saleIsDue && dueDate ? dueDate : undefined,
          exchangeSkuId: saleIsExchange ? exchangeItem!.skuId : undefined,
          exchangeAmount: saleIsExchange ? exchangeItem!.exchangeAmount : 0,
          discountAmount: 0,
          taxAmount: 0,
          shippingAmount: 0,
          items: cart.map((item) => ({
            skuId: item.skuId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            taxAmount: 0,
          })),
          payments: [
            {
              paymentMethod,
              amount: saleIsExchange ? amountAfterExchange : grandTotal,
              referenceNo: paymentReference || undefined,
              status: saleIsDue ? 'pending' : 'paid',
            },
          ],
        }),
      });

      const saleId = salePayload.sale?.id;
      if (!saleId) {
        throw new Error('Sale saved but sale id is missing');
      }

      const reprintPayload = await readJson<ReprintResponse>(`/api/pos/sales/${saleId}/reprint`, {
        method: 'POST',
      });

      if (reprintPayload.receipt) {
        setLastReceiptText(JSON.stringify(reprintPayload.receipt, null, 2));
        setLastInvoice(reprintPayload.receipt);

        // The local print agent polls the backend for pending jobs and prints silently.
        // Browser-to-localhost fetch is blocked by mixed-content on hosted HTTPS origins.
        const isLocalDev = typeof window !== 'undefined' &&
          ['localhost', '127.0.0.1'].includes(window.location.hostname);
        let printed = false;

        if (isLocalDev) {
          try {
            await printReceipt(reprintPayload.receipt, receiptPrinterName || undefined, agentUrl);
            printed = true;
            if (!saleIsDue && paymentMethod === 'cash') {
              await openCashDrawer({ printerName: receiptPrinterName || undefined }, agentUrl).catch(() => {});
            }
          } catch { /* fall through */ }
        }

        if (printed) {
          setMessage(`${saleIsDue ? 'Due sale' : 'Sale'} ${salePayload.sale?.saleNo ?? ''} completed and receipt printed.`);
        } else {
          setInvoiceModalOpen(true);
          setMessage(
            `Sale ${salePayload.sale?.saleNo ?? ''} completed. Receipt queued for local print agent. If the receipt does not print within a few seconds, use the Print Invoice button below.`,
          );
        }
      }

      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setCustomerShopName('');
      setCustomerAddress('');
      setDueDate('');
      setSaleMode('paid');
      setPaymentMethod('cash');
      setPaymentReference('');
      setExchangeItem(null);
      setExchangeSearch('');
      setExchangeResults([]);
      setCashReceived('');
      clearSearchState();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
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
    const opened = openInvoicePrintWindow(lastInvoice);
    if (opened) {
      setMessage(`Invoice ${lastInvoice.saleNo ?? ''} opened for printing.`);
    }
  };

  if (!canUsePos) {
    return (
      <section style={{ display: 'grid', gap: 20 }}>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>POS access limited</h3>
          <p style={tokenMutedStyle}>Your role does not have permission to create sales or use the POS terminal.</p>
        </article>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 20 }}>
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
                  Search, scan, and select the exact sellable item fast.
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
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onFocus={() => { if (groupedResults.length > 0) setShowSuggestions(true); }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void searchCatalog(search.trim());
                      }
                      if (event.key === 'Escape') {
                        setShowSuggestions(false);
                      }
                    }}
                    style={{ ...inputStyle, width: '100%' }}
                    placeholder="Scan barcode or search product / SKU"
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
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                    maxHeight: 340,
                    overflowY: 'auto',
                  }}
                >
                  {groupedResults.map((group) => {
                    if (group.hasVariants) {
                      return (
                        <div
                          key={group.productId}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setShowSuggestions(false); openVariantPicker(group); }}
                          style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
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
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (!singleAvailable) return;
                          setShowSuggestions(false);
                          addSkuToCart(singleSku);
                          clearSearchState();
                          setMessage(`${group.productName} added to cart.`);
                        }}
                        style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: singleAvailable ? 'pointer' : 'default', opacity: singleAvailable ? 1 : 0.5 }}
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
                  Keep the cart tight: selling price, quantity, line total, and nothing distracting.
                </p>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', textAlign: 'right' }}>
                <div>{cart.length} item(s) · Subtotal {currency(total)}</div>
                {totalDiscount > 0 ? (
                  <div style={{ color: '#b45309' }}>Discount -{currency(totalDiscount)}</div>
                ) : null}
                <div style={{ fontWeight: 700, fontSize: 14 }}>Total {currency(grandTotal)}</div>
              </div>
            </div>
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
                        </td>
                        <td style={tableCellStyle}>{currency(item.unitPrice)}</td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button onClick={() => updateCartQty(item.skuId, item.qty - 1)} style={buttonStyle}>-</button>
                            <span>{item.qty}</span>
                            <button onClick={() => updateCartQty(item.skuId, item.qty + 1)} style={buttonStyle}>+</button>
                          </div>
                        </td>
                        <td style={tableCellStyle}>
                          <select
                            value={item.discountType}
                            onChange={(e) => {
                              const newType = e.target.value;
                              if (newType === 'none') {
                                updateCartDiscount(item.skuId, 0, 'none');
                              } else if (newType === 'fixed') {
                                updateCartDiscount(item.skuId, 0, 'fixed');
                              } else if (newType === 'percentage') {
                                updateCartDiscount(item.skuId, 0, 'percentage');
                              }
                            }}
                            style={{ ...inputStyle, width: 70, fontSize: 11, padding: '2px 4px' }}
                          >
                            <option value="none">—</option>
                            <option value="fixed" selected={item.discountType === 'fixed'}>TK</option>
                            <option value="percentage" selected={item.discountType === 'percentage'}>%</option>
                          </select>
                          {item.discountType !== 'none' && item.discountType ? (
                            <input
                              type="number"
                              min={0}
                              value={item.discountType === 'percentage' && item.discountAmount > 0 && item.unitPrice > 0
                                ? String(Math.round(item.discountAmount / item.unitPrice * 100))
                                : item.discountAmount > 0 && item.discountType === 'fixed'
                                  ? String(item.discountAmount)
                                  : ''}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                if (item.discountType === 'fixed') {
                                  updateCartDiscount(item.skuId, val, 'fixed');
                                } else if (item.discountType === 'percentage') {
                                  const pctAmt = item.unitPrice * val / 100;
                                  updateCartDiscount(item.skuId, pctAmt, 'percentage');
                                }
                              }}
                              style={{ ...inputStyle, width: 60, fontSize: 11, padding: '2px 4px', marginTop: 2 }}
                              placeholder="0"
                            />
                          ) : null}
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
                Cart is empty. Scan or search a product to start the sale.
              </div>
            )}
          </article>
          ) : null}
        </section>
        ) : null}

        {(!compact || activeTab === 'checkout') ? (
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Checkout</h3>
          <p style={{ marginTop: 0, color: 'var(--muted-foreground)' }}>
            Customer details stay optional for paid sales, while cash change stays visible for the cashier.
          </p>

          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} style={inputStyle} placeholder="Customer name (optional)" />
            <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} style={inputStyle} placeholder={saleMode === 'due' ? 'Customer mobile number (recommended)' : 'Customer mobile number (optional)'} />
            <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} style={inputStyle} placeholder="Customer email (optional)" />
            <input value={customerShopName} onChange={(event) => setCustomerShopName(event.target.value)} style={inputStyle} placeholder={saleMode === 'due' ? 'Shop name (optional but helpful)' : 'Shop name (optional)'} />
            <textarea value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} style={{ ...inputStyle, minHeight: 76 }} placeholder={saleMode === 'due' ? 'Shop / customer address for due tracking' : 'Customer address (optional)'} />
            {saleMode === 'due' ? (
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} style={inputStyle} />
            ) : null}
          </div>

          <div style={{ ...stackedFilterGridStyle, marginBottom: 12 }}>
            <select aria-label="Sale mode" value={saleMode} onChange={(event) => { setSaleMode(event.target.value as 'paid' | 'due' | 'exchange'); if (event.target.value !== 'exchange') setExchangeItem(null); }} style={inputStyle}>
              <option value="paid">Paid sale</option>
              <option value="due">Due sale</option>
              <option value="exchange">Exchange</option>
            </select>
            <select
              aria-label="Payment method"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'card' | 'mfs' | 'bank_transfer')}
              style={inputStyle}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mfs">MFS</option>
              <option value="bank_transfer">Bank</option>
            </select>
          </div>

          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            <input
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              style={inputStyle}
              placeholder={paymentMethod === 'cash' ? 'Payment note (optional)' : 'Reference no / transaction id'}
            />
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal</span>
              <strong>{currency(total)}</strong>
            </div>
            {totalDiscount > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309' }}>
                <span>Discount</span>
                <strong>-{currency(totalDiscount)}</strong>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 4 }}>
              <span>Total</span>
              <strong>{currency(grandTotal)}</strong>
            </div>
            {saleMode === 'exchange' ? (
              <>
                <div style={{ position: 'relative', marginTop: 4 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input value={exchangeSearch} onChange={(event) => setExchangeSearch(event.target.value)} style={{ ...inputStyle, width: '100%' }} placeholder="Search exchange product" />
                      {exchangeSearching ? <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--muted-foreground)' }}>searching...</span> : null}
                    </div>
                  </div>
                  {exchangeResults.length > 0 ? (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 50, background: 'var(--card)', borderRadius: 8, border: '1px solid var(--border)', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto' }}>
                      {exchangeResults.map((sku) => (
                        <div key={sku.id} onMouseDown={(e) => e.preventDefault()} onClick={() => selectExchangeItem(sku)} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
                          <div style={{ fontWeight: 600 }}>{sku.product_name}</div>
                          <div style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>{sku.sku_code} · BDT {Number(sku.sale_price ?? 0).toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {exchangeItem ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border-weak)' }}>
                      <span style={{ color: 'var(--muted-foreground)' }}>Exchange: {exchangeItem.productName}</span>
                      <strong style={{ color: '#16a34a' }}>-{currency(exchangeItem.exchangeAmount)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, paddingTop: 4 }}>
                      <span>Remaining</span>
                      <strong>{currency(amountAfterExchange)}</strong>
                    </div>
                    {paymentMethod === 'cash' ? (
                      <>
                        <input value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} style={inputStyle} placeholder={`Amount paid by customer (${currency(amountAfterExchange)} required)`} />
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Change due</span>
                          <strong>{currency(changeAmount)}</strong>
                        </div>
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
            {saleMode === 'paid' && paymentMethod === 'cash' ? (
              <>
                <input value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} style={inputStyle} placeholder="Amount paid by customer" />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Change due</span>
                  <strong>{currency(changeAmount)}</strong>
                </div>
              </>
            ) : null}
            {saleMode === 'due' ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted-foreground)' }}>
                <span>Due amount</span>
                <strong>{currency(grandTotal)}</strong>
              </div>
            ) : null}
            <button onClick={checkout} style={gray800ButtonStyle} disabled={loading || cart.length === 0 || !selectedLocationId || (saleMode === 'exchange' && !exchangeItem)}>
              {saleMode === 'due' ? 'Save Due Sale' : saleMode === 'exchange' ? 'Complete Exchange' : 'Complete Sale'}
            </button>
            {!selectedLocationId ? (
              <div style={{ fontSize: 12, color: '#b45309' }}>
                Select a stock location below before completing the sale.
              </div>
            ) : null}
          </div>
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
              backgroundColor: 'var(--card)', borderRadius: 12,
              width: '90%', maxWidth: 896, height: '75vh', maxHeight: 672,
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
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
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCellStyle}>SKU</th>
                        <th style={tableHeaderCellStyle}>Variant</th>
                        <th style={tableHeaderCellStyle}>Barcode</th>
                        <th style={tableHeaderCellStyle}>Available</th>
                        <th style={tableHeaderCellStyle}>Price</th>
                        <th style={tableHeaderCellStyle}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variantProduct.skus.map((sku) => {
                        const skuIsTrackable = variantProduct.product.is_trackable;
                        const skuAvailable = !skuIsTrackable || getSkuAvailableQty(sku) > 0;
                        return (
                        <tr key={sku.id}>
                          <td style={tableCellStyle}>{sku.sku_code}</td>
                          <td style={tableCellStyle}>{sku.variant_label || 'Default'}</td>
                          <td style={tableCellStyle}>{sku.barcode || '—'}</td>
                          <td style={tableCellStyle}>{skuIsTrackable ? formatQty(sku.available_qty) : '—'}</td>
                          <td style={tableCellStyle}>{currency(Number(sku.sale_price ?? 0))}</td>
                          <td style={tableCellStyle}>
                            <button
                              onClick={() => {
                                if (!skuAvailable) {
                                  setMessage(`${variantProduct.product.name} is out of stock in the selected location.`);
                                  return;
                                }
                                addSkuToCart({
                                  id: sku.id,
                                  sku_code: sku.sku_code,
                                  barcode: sku.barcode,
                                  variant_label: sku.variant_label,
                                  product_name: variantProduct.product.name,
                                  sale_price: sku.sale_price,
                                  available_qty: sku.available_qty,
                                  is_trackable: skuIsTrackable,
                                  discount_type: (sku as any).discount_type,
                                  discount_value: (sku as any).discount_value,
                                });
                                setVariantPickerOpen(false);
                                clearSearchState();
                                setMessage(`${variantProduct.product.name} variant added to cart.`);
                              }}
                              style={secondaryButtonStyle}
                              disabled={!skuAvailable}
                            >
                              {!skuAvailable ? 'Out of Stock' : 'Add Variant'}
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={tokenMutedStyle}>No variants loaded for this product yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <Sheet open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
        <SheetContent side="bottom" className="sm:max-w-full sm:max-h-[90vh] overflow-auto">
          <SheetHeader>
            <SheetTitle>Invoice {lastInvoice?.saleNo || ''}</SheetTitle>
            <SheetDescription>
              Printer unavailable. Review the invoice and print using your browser.
            </SheetDescription>
          </SheetHeader>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                if (lastInvoice) {
                  const w = window.open('', '_blank', 'noopener,noreferrer');
                  if (w) {
                    w.document.open();
                    w.document.write(renderInvoiceHtml(lastInvoice));
                    w.document.close();
                    w.focus();
                    w.print();
                  }
                }
              }}
              style={primaryButtonStyle}
            >
              Print Invoice
            </button>
            <button onClick={() => setInvoiceModalOpen(false)} style={neutralButtonStyle}>
              Close
            </button>
          </div>
          {lastInvoice ? (
            <div
              style={{ marginTop: 16 }}
              dangerouslySetInnerHTML={{ __html: renderInvoiceHtml(lastInvoice) }}
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
          <select aria-label="Stock source" value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} style={{ ...inputStyle, marginTop: 8, fontSize: 12 }}>
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
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={{ marginTop: 0, color: 'var(--muted-foreground)' }}>{message}</p>
        {lastInvoice ? (
          <div style={{ marginBottom: 16, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <strong>Latest invoice preview</strong>
              <button onClick={handlePrintInvoice} style={buttonStyle}>
                Print Invoice
              </button>
            </div>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--card)',
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {lastInvoice.store?.logoUrl ? (
                    <img
                      src={lastInvoice.store.logoUrl}
                      alt={`${lastInvoice.store?.name || 'Store'} logo`}
                      style={{ width: 60, height: 60, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 10, padding: 6, background: 'var(--card)' }}
                    />
                  ) : null}
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{lastInvoice.store?.name || 'Store'}</div>
                    {lastInvoice.store?.phone ? <div style={{ color: 'var(--muted-foreground)' }}>{lastInvoice.store.phone}</div> : null}
                    {lastInvoice.store?.email ? <div style={{ color: 'var(--muted-foreground)' }}>{lastInvoice.store.email}</div> : null}
                    {lastInvoice.store?.address ? <div style={{ color: 'var(--muted-foreground)' }}>{lastInvoice.store.address}</div> : null}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>Invoice</div>
                  <div style={{ color: 'var(--muted-foreground)' }}>No: {lastInvoice.saleNo || '—'}</div>
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                <div><strong>Customer:</strong> {lastInvoice.customer?.name || 'Walk-in customer'}</div>
                {lastInvoice.customer?.phone ? <div><strong>Phone:</strong> {lastInvoice.customer.phone}</div> : null}
                {lastInvoice.customer?.address ? <div><strong>Address:</strong> {lastInvoice.customer.address}</div> : null}
              </div>
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                Developed and maintained by Market One BD · Your One Stop Marketplace
              </div>
            </div>
          </div>
        ) : null}
        {lastReceiptText ? (
          <pre
            style={{
              marginBottom: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'var(--card)',
              padding: 12,
              borderRadius: 6,
              border: '1px solid var(--border)',
              overflowX: 'auto',
              color: 'var(--foreground)',
            }}
          >
            {lastReceiptText}
          </pre>
        ) : null}
      </article>
    </section>
  );
}
