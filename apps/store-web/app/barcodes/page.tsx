'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
  pageShellStyle,
  searchButtonStyle,
  subtleButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
} from '../merchflow-theme';
import { WorkspaceTabs } from '../workspace-responsive';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/searchable-select';
import {
  fetchPrintAgentHealth,
  printProductLabel,
  printProductLabelBatch,
  type PrintAgentHealth,
} from '../../lib/print-agent';
import { loadWorkstationProfile } from '../../lib/workstation-profile';
import { renderLabelToCanvas, type LabelSymbology } from '../../lib/label-preview';

type SkuRow = {
  id: string;
  sku_code: string;
  product_name: string;
  variant_label?: string | null;
  barcode?: string | null;
  sale_price?: string | number | null;
  cost_price?: string | number | null;
  available_qty?: string | number | null;
  category_name?: string | null;
  brand_name?: string | null;
};

type Tab = 'print' | 'settings';

const formatMoney = (v: string | number | null | undefined) =>
  Number(Number(v ?? 0).toFixed(2)).toLocaleString('en-IN', { minimumFractionDigits: 2 });

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    const err = payload as { error?: string } | null;
    throw new Error(err?.error || `Request failed with ${response.status}`);
  }
  return payload as T;
}

// ── Label Preview Canvas Component ──

function LabelPreview({
  sku,
  productName,
  storeName,
  sellingPrice,
  symbology,
  showStore,
  showName,
  showSellingPrice,
  showBarcode,
  showBarcodeNumber,
  showBorder,
  labelWidth,
  labelHeight,
}: {
  sku: string;
  productName: string;
  storeName: string;
  sellingPrice?: number | null;
  symbology: LabelSymbology;
  showStore: boolean;
  showName: boolean;
  showSellingPrice: boolean;
  showBarcode: boolean;
  showBarcodeNumber: boolean;
  showBorder: boolean;
  labelWidth: number;
  labelHeight: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpi = 203;
  const wDots = Math.round((labelWidth * dpi) / 25.4);
  const hDots = Math.round((labelHeight * dpi) / 25.4);
  const onScreenScale = 0.75;

  useEffect(() => {
    if (!ref.current) return;
    renderLabelToCanvas(
      ref.current,
      { sku, productName, storeName, sellingPrice },
      {
        widthMm: labelWidth,
        heightMm: labelHeight,
        symbology,
        showStore,
        showName,
        showSellingPrice,
        showBarcode,
        showBarcodeNumber,
        showBorder,
      },
    );
  }, [
    sku, productName, storeName, sellingPrice, symbology,
    showStore, showName, showSellingPrice, showBarcode, showBarcodeNumber,
    showBorder, labelWidth, labelHeight,
  ]);

  return (
    <canvas
      ref={ref}
      style={{
        width: wDots * onScreenScale,
        height: hDots * onScreenScale,
        imageRendering: 'crisp-edges',
        border: '1px solid var(--border)',
        borderRadius: 4,
      }}
    />
  );
}

// ── Main Page ──

export default function BarcodesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('print');
  const [message, setMessage] = useState('Print barcode labels for your products.');
  const [loading, setLoading] = useState(false);

  // SKU data
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState<SkuRow[]>([]);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [skuSearching, setSkuSearching] = useState(false);

  // Label settings
  const [storeName, setStoreName] = useState('Store');
  const [symbology, setSymbology] = useState<LabelSymbology>('CODE128');
  const [labelWidth, setLabelWidth] = useState(40);
  const [labelHeight, setLabelHeight] = useState(25);
  const [copies, setCopies] = useState(1);
  const [showStore, setShowStore] = useState(true);
  const [showName, setShowName] = useState(true);
  const [showSellingPrice, setShowSellingPrice] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showBarcodeNumber, setShowBarcodeNumber] = useState(true);
  const [showBorder, setShowBorder] = useState(true);

  // Printer state
  const [printHealth, setPrintHealth] = useState<PrintAgentHealth | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const profile = loadWorkstationProfile();

  // Load printer health
  useEffect(() => {
    fetchPrintAgentHealth(profile.agentUrl)
      .then((h) => { setPrintHealth(h); setPrintError(null); })
      .catch((e) => { setPrintHealth(null); setPrintError(e.message); });
  }, [profile.agentUrl]);

  // Search SKUs
  const searchSkus = async () => {
    if (!skuSearch.trim()) { setSkuResults([]); return; }
    setSkuSearching(true);
    try {
      const payload = await readJson<{ skus: SkuRow[] }>(
        `/api/catalog/skus/search?q=${encodeURIComponent(skuSearch.trim())}&limit=50`,
      );
      setSkuResults(payload.skus ?? []);
      setMessage(`Found ${payload.skus?.length ?? 0} SKU(s).`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSkuSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { void searchSkus(); }, 200);
    return () => clearTimeout(timer);
  }, [skuSearch]);

  const toggleSku = (skuId: string) => {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedSkus.size === skuResults.length) {
      setSelectedSkus(new Set());
    } else {
      setSelectedSkus(new Set(skuResults.map((s) => s.id)));
    }
  };

  // Print single label
  const handlePrintOne = async (sku: SkuRow) => {
    setPrinting(true);
    try {
      await printProductLabel({
        sku: sku.barcode || sku.sku_code,
        productName: sku.product_name + (sku.variant_label ? ` ${sku.variant_label}` : ''),
        storeName,
        sellingPrice: sku.sale_price ? Number(sku.sale_price) : null,
        printerName: profile.labelPrinterName || undefined,
        widthMm: labelWidth,
        heightMm: labelHeight,
        barcodeType: symbology === 'CODE128' ? '128' : symbology === 'EAN13' ? 'EAN13' : '128',
        copies,
        border: showBorder,
      }, profile.agentUrl);
      toast.success(`Label printed for ${sku.sku_code}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPrinting(false);
    }
  };

  // Print selected labels (batch)
  const handlePrintSelected = async () => {
    const selected = skuResults.filter((s) => selectedSkus.has(s.id));
    if (!selected.length) { setMessage('Select at least one SKU.'); return; }
    setPrinting(true);
    try {
      await printProductLabelBatch({
        items: selected.map((sku) => ({
          sku: sku.barcode || sku.sku_code,
          productName: sku.product_name + (sku.variant_label ? ` ${sku.variant_label}` : ''),
          storeName,
          sellingPrice: sku.sale_price ? Number(sku.sale_price) : null,
          copies,
        })),
        printerName: profile.labelPrinterName || undefined,
        widthMm: labelWidth,
        heightMm: labelHeight,
        barcodeType: symbology === 'CODE128' ? '128' : symbology === 'EAN13' ? 'EAN13' : '128',
        border: showBorder,
      }, profile.agentUrl);
      toast.success(`Printed ${selected.length} label(s)`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPrinting(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'print', label: 'Print Labels' },
    { key: 'settings', label: 'Label Settings' },
  ];

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>{message}</p>
        <WorkspaceTabs active={activeTab} onChange={(key) => setActiveTab(key as Tab)} tabs={tabs} />
      </div>

      {/* ═══════════════ Print Labels Tab ═══════════════ */}
      {activeTab === 'print' ? (
        <section style={{ display: 'grid', gap: 14 }}>
          {/* Search & Actions */}
          <article style={surfaceCardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>Barcode Labels</h3>
            <p style={{ margin: '0 0 12px', color: 'var(--muted-foreground)', fontSize: 12 }}>
              Search products, select labels to print, and send to your label printer.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                style={{ ...fieldStyle, flex: 1 }}
                placeholder="Search by product name, SKU, or barcode..."
              />
              <button onClick={() => void searchSkus()} style={searchButtonStyle} disabled={skuSearching}>
                {skuSearching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {skuResults.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedSkus.size === skuResults.length}
                    onChange={toggleAll}
                    style={{ accentColor: '#0f172a' }}
                  />
                  Select all ({skuResults.length})
                </label>
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {selectedSkus.size} selected
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => void handlePrintSelected()}
                    style={{ ...gray800ButtonStyle, minWidth: 140 }}
                    disabled={printing || selectedSkus.size === 0 || !printHealth}
                  >
                    {printing ? 'Printing...' : `Print Selected (${selectedSkus.size})`}
                  </button>
                </div>
              </div>
            )}

            {!printHealth && !printError && (
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>
                Checking print agent...
              </div>
            )}
            {printError && (
              <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
                Print agent offline: {printError}
              </div>
            )}
          </article>

          {/* SKU List + Preview */}
          {skuResults.length > 0 && (
            <article style={surfaceCardStyle}>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}></th>
                      <th style={tableHeaderCellStyle}>Product</th>
                      <th style={tableHeaderCellStyle}>SKU</th>
                      <th style={tableHeaderCellStyle}>Barcode</th>
                      <th style={tableHeaderCellStyle}>Price</th>
                      <th style={tableHeaderCellStyle}>Stock</th>
                      <th style={tableHeaderCellStyle}>Preview</th>
                      <th style={tableHeaderCellStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuResults.map((sku) => (
                      <tr key={sku.id}>
                        <td style={tableCellStyle}>
                          <input
                            type="checkbox"
                            checked={selectedSkus.has(sku.id)}
                            onChange={() => toggleSku(sku.id)}
                            style={{ accentColor: '#0f172a' }}
                          />
                        </td>
                        <td style={tableCellStyle}>
                          <div style={{ fontWeight: 600 }}>{sku.product_name}</div>
                          {sku.variant_label && (
                            <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{sku.variant_label}</div>
                          )}
                        </td>
                        <td style={{ ...tableCellStyle, fontFamily: 'monospace', fontSize: 12 }}>{sku.sku_code}</td>
                        <td style={{ ...tableCellStyle, fontFamily: 'monospace', fontSize: 12 }}>{sku.barcode || '—'}</td>
                        <td style={tableCellStyle}>{formatMoney(sku.sale_price)}</td>
                        <td style={tableCellStyle}>{Number(sku.available_qty ?? 0)}</td>
                        <td style={tableCellStyle}>
                          <LabelPreview
                            sku={sku.barcode || sku.sku_code}
                            productName={sku.product_name + (sku.variant_label ? ` ${sku.variant_label}` : '')}
                            storeName={storeName}
                            sellingPrice={sku.sale_price ? Number(sku.sale_price) : null}
                            symbology={symbology}
                            showStore={showStore}
                            showName={showName}
                            showSellingPrice={showSellingPrice}
                            showBarcode={showBarcode}
                            showBarcodeNumber={showBarcodeNumber}
                            showBorder={showBorder}
                            labelWidth={labelWidth}
                            labelHeight={labelHeight}
                          />
                        </td>
                        <td style={tableCellStyle}>
                          <button
                            onClick={() => void handlePrintOne(sku)}
                            style={{ ...subtleButtonStyle, fontSize: 11, padding: '4px 8px' }}
                            disabled={printing || !printHealth}
                          >
                            Print
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}

          {skuResults.length === 0 && !skuSearching && (
            <div style={emptyStateStyle}>
              Search for products to print barcode labels.
            </div>
          )}
        </section>
      ) : null}

      {/* ═══════════════ Label Settings Tab ═══════════════ */}
      {activeTab === 'settings' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {/* Settings */}
          <article style={surfaceCardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>Label Settings</h3>

            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Store Name</span>
                <input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  style={fieldStyle}
                  placeholder="Store name"
                />
              </label>

              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Barcode Symbology</span>
                <select
                  value={symbology}
                  onChange={(e) => setSymbology(e.target.value as LabelSymbology)}
                  style={fieldStyle}
                >
                  <option value="CODE128">CODE 128</option>
                  <option value="EAN13">EAN-13</option>
                  <option value="UPCA">UPC-A</option>
                </select>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Width (mm)</span>
                  <input
                    type="number"
                    value={labelWidth}
                    onChange={(e) => setLabelWidth(Number(e.target.value) || 40)}
                    style={fieldStyle}
                    min={20}
                    max={100}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Height (mm)</span>
                  <input
                    type="number"
                    value={labelHeight}
                    onChange={(e) => setLabelHeight(Number(e.target.value) || 25)}
                    style={fieldStyle}
                    min={10}
                    max={60}
                  />
                </label>
              </div>

              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Copies per Label</span>
                <input
                  type="number"
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
                  style={fieldStyle}
                  min={1}
                  max={99}
                />
              </label>

              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Show on Label</span>
                {[
                  { label: 'Store name', checked: showStore, onChange: setShowStore },
                  { label: 'Product name', checked: showName, onChange: setShowName },
                  { label: 'Selling price', checked: showSellingPrice, onChange: setShowSellingPrice },
                  { label: 'Barcode image', checked: showBarcode, onChange: setShowBarcode },
                  { label: 'Barcode number', checked: showBarcodeNumber, onChange: setShowBarcodeNumber },
                  { label: 'Label border', checked: showBorder, onChange: setShowBorder },
                ].map(({ label, checked, onChange }) => (
                  <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => onChange(e.target.checked)}
                      style={{ accentColor: '#0f172a' }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </article>

          {/* Preview */}
          <article style={surfaceCardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>Label Preview</h3>
            <div style={{ display: 'flex', justifyContent: 'center', padding: 10, background: 'var(--muted)', borderRadius: 6 }}>
              <LabelPreview
                sku="DEMO-001"
                productName="Sample Product"
                storeName={storeName}
                sellingPrice={1250}
                symbology={symbology}
                showStore={showStore}
                showName={showName}
                showSellingPrice={showSellingPrice}
                showBarcode={showBarcode}
                showBarcodeNumber={showBarcodeNumber}
                showBorder={showBorder}
                labelWidth={labelWidth}
                labelHeight={labelHeight}
              />
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 8, textAlign: 'center' }}>
              {labelWidth}×{labelHeight}mm · 203 DPI · {symbology}
            </p>
          </article>
        </div>
      ) : null}
    </section>
  );
}
