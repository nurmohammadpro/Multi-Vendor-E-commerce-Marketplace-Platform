'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_PRINT_AGENT_URL,
  fetchPrintAgentHealth,
  openCashDrawer,
  printLabel,
  printReceipt,
  type PrintAgentHealth,
  type ReceiptPayload,
} from '../../lib/print-agent';
import { loadWorkstationProfile } from '../../lib/workstation-profile';
import { fieldStyle, primaryButtonStyle, secondaryButtonStyle, surfaceCardStyle, tokenMutedStyle } from '../motocore-theme';

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
  sku_code: string;
  barcode?: string | null;
  variant_label?: string | null;
  product_name: string;
  sale_price?: string | number | null;
  available_qty?: string | number | null;
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

const currency = (value: number) => value.toFixed(2);

const cardStyle = surfaceCardStyle;
const inputStyle = fieldStyle;
const buttonStyle = secondaryButtonStyle;

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? payload.error
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export function PosTerminal({ canUsePos }: { canUsePos: boolean }) {
  const [registers, setRegisters] = useState<Register[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SkuSearchResult[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('0');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('POS ready for barcode-first checkout.');
  const [printHealth, setPrintHealth] = useState<PrintAgentHealth | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [lastReceiptText, setLastReceiptText] = useState('');
  const [receiptPrinterName, setReceiptPrinterName] = useState('');
  const [labelPrinterName, setLabelPrinterName] = useState('');
  const [agentUrl, setAgentUrl] = useState(DEFAULT_PRINT_AGENT_URL);

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
    void fetchPrintAgentHealth(agentUrl)
      .then((health) => {
        setPrintHealth(health);
        setPrintError(null);
      })
      .catch((error: Error) => {
        setPrintHealth(null);
        setPrintError(error.message);
      });
  }, [agentUrl]);

  const selectedRegister = useMemo(
    () => registers.find((register) => register.id === selectedRegisterId) ?? null,
    [registers, selectedRegisterId],
  );

  const openShiftId = selectedRegister?.open_shift_id || null;

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.qty * item.unitPrice, 0),
    [cart],
  );

  const changeAmount = useMemo(() => {
    const paid = Number(cashReceived || 0);
    return Math.max(paid - total, 0);
  }, [cashReceived, total]);

  const searchCatalog = async () => {
    if (!search.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const query = new URLSearchParams({
        q: search.trim(),
        limit: '20',
      });
      const payload = await readJson<{ skus: SkuSearchResult[] }>(`/api/pos/search?${query.toString()}`);
      setResults(payload.skus ?? []);
      setMessage(`Found ${payload.skus?.length ?? 0} matching SKU(s).`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (sku: SkuSearchResult) => {
    setCart((current) => {
      const index = current.findIndex((item) => item.skuId === sku.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = {
          ...next[index],
          qty: Math.min(next[index].qty + 1, Math.max(1, Number(sku.available_qty ?? 0))),
        };
        return next;
      }

      return [
        ...current,
        {
          skuId: sku.id,
          skuCode: sku.sku_code,
          productName: sku.product_name,
          variantLabel: sku.variant_label,
          unitPrice: Number(sku.sale_price ?? 0),
          qty: 1,
          availableQty: Number(sku.available_qty ?? 0),
          barcode: sku.barcode,
        },
      ];
    });
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

    setLoading(true);
    try {
      const salePayload = await readJson<SaleCreateResponse>('/api/pos/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locationId: selectedLocationId,
          registerId: selectedRegisterId || undefined,
          shiftId: openShiftId || undefined,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          discountAmount: 0,
          taxAmount: 0,
          shippingAmount: 0,
          items: cart.map((item) => ({
            skuId: item.skuId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discountAmount: 0,
            taxAmount: 0,
          })),
          payments: [
            {
              paymentMethod: 'cash',
              amount: total,
              status: 'paid',
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
        try {
          await printReceipt(reprintPayload.receipt, receiptPrinterName || undefined, agentUrl);
          let drawerWarning = '';
          if (Number(total) > 0) {
            await openCashDrawer({ printerName: receiptPrinterName || undefined }, agentUrl).catch(() => {
              drawerWarning = ' The cash drawer did not open.';
            });
          }
          setMessage(`Sale ${salePayload.sale?.saleNo ?? ''} completed and receipt printed.${drawerWarning}`);
        } catch (printFailure) {
          setMessage(
            `Sale ${salePayload.sale?.saleNo ?? ''} completed. Silent print failed: ${(printFailure as Error).message}`,
          );
        }
      }

      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setCashReceived('');
      setResults([]);
      setSearch('');
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
      <section style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 16 }}>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Workstation Readiness</h3>
          <p style={tokenMutedStyle}>
            Print agent URL: <code>{agentUrl}</code>
          </p>
          <p style={{ marginBottom: 6 }}>Receipt printer: {printHealth?.printerName || 'Not detected'}</p>
          <p style={{ marginTop: 0, marginBottom: 6 }}>
            Label printer: {printHealth?.labelPrinterName || 'Not detected'}
          </p>
          <p style={{ marginTop: 0, marginBottom: 6, color: '#64748b' }}>
            Saved profile: {receiptPrinterName || 'receipt printer not set'} · {labelPrinterName || 'label printer not set'}
          </p>
          <p style={{ margin: 0, color: printError ? '#fca5a5' : '#86efac' }}>
            {printError ? `Unavailable: ${printError}` : 'Silent print agent reachable'}
          </p>
          <button onClick={handleOpenDrawer} style={{ ...buttonStyle, marginTop: 12 }} disabled={Boolean(printError)}>
            Test Cash Drawer
          </button>
          <p style={{ marginTop: 8, marginBottom: 0, color: '#64748b' }}>
            ESC/POS receipt, barcode, label, and cash drawer commands are enabled when the local print agent is running.
          </p>
        </article>

        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Register</h3>
          <select value={selectedRegisterId} onChange={(event) => setSelectedRegisterId(event.target.value)} style={inputStyle}>
            <option value="">Select register</option>
            {registers.map((register) => (
              <option key={register.id} value={register.id}>
                {register.code} — {register.name}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} style={inputStyle} placeholder="Opening cash" />
            <button onClick={openShift} style={buttonStyle} disabled={loading || Boolean(openShiftId)}>
              Open Shift
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input value={closingCash} onChange={(event) => setClosingCash(event.target.value)} style={inputStyle} placeholder="Closing cash" />
            <button onClick={closeShift} style={buttonStyle} disabled={loading || !openShiftId}>
              Close Shift
            </button>
          </div>
        </article>

        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Stock Source</h3>
          <select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} style={inputStyle}>
            <option value="">Select location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code} — {location.name}
              </option>
            ))}
          </select>
          <p style={{ marginTop: 12, marginBottom: 0, color: '#475569' }}>
            USB HID barcode scanners can type directly into the search field below.
          </p>
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Catalog Search</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void searchCatalog();
                }
              }}
              style={inputStyle}
              placeholder="Scan barcode or search product / SKU"
            />
            <button onClick={searchCatalog} style={buttonStyle} disabled={loading}>
              Search
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {results.map((sku) => (
              <article key={sku.id} style={{ ...cardStyle, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{sku.product_name}</div>
                    <div style={{ color: '#475569' }}>
                      {sku.sku_code}
                      {sku.variant_label ? ` · ${sku.variant_label}` : ''}
                    </div>
                    <div style={{ color: '#64748b' }}>
                      Stock: {Number(sku.available_qty ?? 0)} · Price: {currency(Number(sku.sale_price ?? 0))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handlePrintLabel(sku)} style={buttonStyle}>
                      Label
                    </button>
                    <button onClick={() => addToCart(sku)} style={buttonStyle}>
                      Add
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {results.length === 0 ? <p style={{ marginBottom: 0, color: '#64748b' }}>No search results yet.</p> : null}
          </div>
        </article>

        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Checkout</h3>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} style={inputStyle} placeholder="Customer name (optional)" />
            <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} style={inputStyle} placeholder="Customer phone (optional)" />
          </div>

          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {cart.map((item) => (
              <article key={item.skuId} style={{ ...cardStyle, padding: 14 }}>
                <div style={{ fontWeight: 600 }}>{item.productName}</div>
                <div style={{ color: '#475569' }}>
                  {item.skuCode}
                  {item.variantLabel ? ` · ${item.variantLabel}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                  <button onClick={() => updateCartQty(item.skuId, item.qty - 1)} style={buttonStyle}>
                    -
                  </button>
                  <span>{item.qty}</span>
                  <button onClick={() => updateCartQty(item.skuId, item.qty + 1)} style={buttonStyle}>
                    +
                  </button>
                  <span style={{ marginLeft: 'auto' }}>{currency(item.qty * item.unitPrice)}</span>
                  <button onClick={() => removeFromCart(item.skuId)} style={buttonStyle}>
                    Remove
                  </button>
                </div>
              </article>
            ))}
            {cart.length === 0 ? <p style={{ marginBottom: 0, color: '#64748b' }}>Cart is empty.</p> : null}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Total</span>
              <strong>{currency(total)}</strong>
            </div>
            <input value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} style={inputStyle} placeholder="Cash received" />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Change</span>
              <strong>{currency(changeAmount)}</strong>
            </div>
            <button onClick={checkout} style={primaryButtonStyle} disabled={loading || cart.length === 0}>
              Complete Sale
            </button>
          </div>
        </article>
      </section>

      <article style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={{ marginTop: 0, color: '#475569' }}>{message}</p>
        {lastReceiptText ? (
          <pre
            style={{
              marginBottom: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: '#ffffff',
              padding: 12,
              borderRadius: 6,
              border: '1px solid rgba(148, 163, 184, 0.22)',
              overflowX: 'auto',
              color: '#0f172a',
            }}
          >
            {lastReceiptText}
          </pre>
        ) : null}
      </article>
    </section>
  );
}
