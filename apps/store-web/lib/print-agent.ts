import { renderReceipt } from "./receipt-template.js";
import { renderInvoiceA4 } from "./invoice-template.js";
export const DEFAULT_PRINT_AGENT_URL =
  process.env.NEXT_PUBLIC_PRINT_AGENT_URL || 'http://127.0.0.1:17668';

export type PrintAgentHealth = {
  ok: boolean;
  service?: string;
  port?: number;
  platform?: string;
  printerName?: string | null;
  labelPrinterName?: string | null;
  features?: {
    receiptPrinting?: boolean;
    labelPrinting?: boolean;
    cashDrawer?: boolean;
    barcodePrinting?: boolean;
    rawPrinting?: boolean;
    logoPrinting?: boolean;
  };
};

export type PrintAgentPrinter = {
  name: string;
  isDefault?: boolean;
  driverName?: string | null;
  portName?: string | null;
};

export type PrintAgentPrinterList = {
  ok: boolean;
  printers: PrintAgentPrinter[];
  defaults?: {
    receiptPrinterName?: string | null;
    labelPrinterName?: string | null;
  };
};

export type ReceiptPayload = {
  saleId?: string | null;
  saleNo?: string | null;
  invoiceNo?: string | null;
  saleDate?: string | null;
  paymentTerms?: 'paid' | 'due' | 'cod' | null;
  saleType?: 'paid' | 'due' | 'exchange' | null;
  paymentStatus?: string | null;
  dueDate?: string | null;
  note?: string | null;
  preparedBy?: string | null;
  amountInWords?: string | null;
  store?: {
    name?: string | null;
    logoUrl?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    footer?: string | null;
  };
  customer?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    shopName?: string | null;
    address?: string | null;
  };
  items?: Array<{
    name?: string | null;
    skuCode?: string | null;
    variantLabel?: string | null;
    barcode?: string | null;
    qty?: number;
    unitPrice?: number;
    discountAmount?: number;
    lineTotal?: number;
    isExchangeItem?: boolean;
  }>;
  totals?: {
    subtotal?: number;
    discount?: number;
    vat?: number;
    tax?: number;
    shipping?: number;
    total?: number;
    paid?: number;
    due?: number;
    change?: number;
  };
  payments?: Array<{
    paymentMethod?: string | null;
    amount?: number;
    status?: string | null;
    referenceNo?: string | null;
    paidAt?: string | null;
  }>;
  exchange?: {
    productName?: string | null;
    skuCode?: string | null;
    amount?: number;
  };
  printedAt?: string | null;
};

const money = (value: number | undefined | null) => Number(value ?? 0).toFixed(2);

function grossSubtotal(items: ReceiptPayload['items']) {
  return (items ?? []).reduce((sum, item) => sum + (item.isExchangeItem ? 0 : Number(item.lineTotal ?? 0)), 0);
}

function exAmount(exchange: ReceiptPayload['exchange']) {
  return exchange ? Number(exchange.amount ?? 0) : 0;
}
const RECEIPT_COLUMNS = 32;
const ESC = 0x1b;
const GS = 0x1d;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function fetchPrintAgentHealth(baseUrl = DEFAULT_PRINT_AGENT_URL) {
  const response = await fetch(`${baseUrl}/health`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Print agent health failed with ${response.status}`);
  }
  return (await response.json()) as PrintAgentHealth;
}

export async function fetchPrintAgentPrinters(baseUrl = DEFAULT_PRINT_AGENT_URL) {
  const response = await fetch(`${baseUrl}/printers`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Print agent printers failed with ${response.status}`);
  }
  return (await response.json()) as PrintAgentPrinterList;
}

export function formatReceiptText(receipt: ReceiptPayload) {
  const t = receipt.totals ?? {};
  const total = Number(t.total ?? 0);
  const discount = Number(t.discount ?? 0);
  const vat = Number(t.vat ?? 0);
  const tax = Number(t.tax ?? 0);
  const paid = Number(t.paid ?? 0);
  const due = Number(t.due ?? 0);
  const items = receipt.items ?? [];
  const gst = grossSubtotal(items);
  const exa = exAmount(receipt.exchange);
  const payments = receipt.payments ?? [];

  const columns = RECEIPT_COLUMNS;
  const sep = '-'.repeat(columns);

  const lines = [
    receipt.store?.name || 'Store',
    'Sales Receipt',
    receipt.saleNo ? `Invoice No: ${receipt.saleNo}` : null,
    receipt.printedAt ? `Date: ${new Date(receipt.printedAt).toLocaleString()}` : null,
    receipt.customer?.name ? `Customer: ${receipt.customer.name}` : null,
    receipt.customer?.phone ? `Phone: ${receipt.customer.phone}` : null,
    receipt.customer?.shopName ? `Shop: ${receipt.customer.shopName}` : null,
    sep,
    'Item                     Qty     Total',
    sep,
    ...items.flatMap((item) => {
      const rows: (string | null)[] = [item.name || 'Item'];
      const right = `${item.qty ?? 0}  ${money(item.lineTotal)}`;
      if (item.variantLabel) {
        rows.push(padLine(`  ${item.variantLabel}`, right));
      } else {
        rows.push(padLine('', right));
      }
      if (item.skuCode) rows.push(`  SKU: ${item.skuCode}`);
      return rows;
    }),
    sep,
    padLine('Sub Total', money(gst)),
    '',
    ...(exa > 0 ? [padLine('Exchange (Optional)', `-${money(exa)}`)] : []),
    ...(discount > 0 ? [padLine('Discount (Optional)', `-${money(discount)}`)] : []),
    ...(vat > 0 ? [padLine('VAT (Optional)', money(vat))] : []),
    ...(tax > 0 ? [padLine('Tax (Optional)', money(tax))] : []),
    sep,
    padLine('Net Payable', money(total)),
    '',
    ...(payments.length ? ['Payment:', ...payments.map((p) => padLine(p.paymentMethod || 'payment', money(p.amount)))] : []),
    sep,
    padLine('Due', money(due)),
    sep,
    ...(receipt.amountInWords ? [receipt.amountInWords] : []),
    ...(receipt.preparedBy ? [`Seller: ${receipt.preparedBy}`] : []),
    receipt.note ? `Note: ${receipt.note}` : null,
    receipt.store?.footer || 'Thank you',
  ];

  return lines.filter(Boolean).join('\n');
}

function sanitizeReceiptText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\x20-\x7E\n]/g, '')
    .replace(/\r/g, '');
}

function centerText(value: string, width = RECEIPT_COLUMNS) {
  const trimmed = sanitizeReceiptText(value).slice(0, width);
  const left = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return `${' '.repeat(left)}${trimmed}`;
}

function padLine(left: string, right: string, width = RECEIPT_COLUMNS) {
  const safeLeft = sanitizeReceiptText(left);
  const safeRight = sanitizeReceiptText(right);
  const spaces = Math.max(1, width - safeLeft.length - safeRight.length);
  return `${safeLeft}${' '.repeat(spaces)}${safeRight}`.slice(0, width);
}

function wrapText(value: string, width = RECEIPT_COLUMNS) {
  const words = sanitizeReceiptText(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

async function loadImageElement(source: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load store logo for receipt printing.'));
    image.src = source;
  });
}

async function buildLogoRasterBytes(source: string, maxWidth = 384) {
  const image = await loadImageElement(source);
  const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth || image.width));
  const width = Math.max(8, Math.floor(((image.naturalWidth || image.width) * scale) / 8) * 8);
  const height = Math.max(8, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is not available for receipt logo rendering.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const { data } = context.getImageData(0, 0, width, height);
  const bytesPerRow = width / 8;
  const raster = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = data[index] ?? 255;
      const green = data[index + 1] ?? 255;
      const blue = data[index + 2] ?? 255;
      const alpha = data[index + 3] ?? 255;
      const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
      const isBlack = alpha > 30 && luminance < 180;
      if (isBlack) {
        const offset = y * bytesPerRow + Math.floor(x / 8);
        raster[offset] |= 0x80 >> (x % 8);
      }
    }
  }

  return new Uint8Array([
    GS, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
    ...raster,
  ]);
}

async function buildEscPosReceipt(receipt: ReceiptPayload) {
  const encoder = new TextEncoder();
  const chunks: number[] = [ESC, 0x40];
  const pushText = (value: string, align: 0 | 1 | 2 = 0) => {
    chunks.push(ESC, 0x61, align);
    chunks.push(...encoder.encode(`${sanitizeReceiptText(value)}\n`));
  };

  const t = receipt.totals ?? {};
  const total = Number(t.total ?? 0);
  const discount = Number(t.discount ?? 0);
  const vat = Number(t.vat ?? 0);
  const tax = Number(t.tax ?? 0);
  const due = Number(t.due ?? 0);
  const gst = grossSubtotal(receipt.items);
  const exa = exAmount(receipt.exchange);
  const payments = receipt.payments ?? [];
  const sep = '-'.repeat(RECEIPT_COLUMNS);

  if (receipt.store?.logoUrl) {
    try {
      chunks.push(ESC, 0x61, 1);
      chunks.push(...Array.from(await buildLogoRasterBytes(receipt.store.logoUrl)));
      chunks.push(0x0a);
    } catch {
      // Fall back to text-only receipt if logo rendering fails.
    }
  }

  pushText(centerText(receipt.store?.name || 'Store'), 1);
  for (const line of [receipt.store?.phone, receipt.store?.email, receipt.store?.address].filter(Boolean) as string[]) {
    for (const wrapped of wrapText(line)) {
      pushText(centerText(wrapped), 1);
    }
  }
  pushText(sep);
  pushText(centerText('Sales Receipt'), 1);
  pushText(receipt.saleNo ? padLine('Invoice No', receipt.saleNo) : '');
  pushText(`Date: ${sanitizeReceiptText(receipt.printedAt ? new Date(receipt.printedAt).toLocaleString() : new Date().toLocaleString())}`);
  if (receipt.customer?.name) pushText(`Customer: ${receipt.customer.name}`);
  if (receipt.customer?.phone) pushText(`Phone: ${receipt.customer.phone}`);
  if (receipt.customer?.shopName) pushText(`Shop: ${receipt.customer.shopName}`);
  if (receipt.customer?.address) {
    for (const wrapped of wrapText(`Address: ${receipt.customer.address}`)) {
      pushText(wrapped);
    }
  }
  pushText(sep);
  pushText(padLine('Item', 'Qty  Total'));
  pushText(sep);

  for (const item of receipt.items ?? []) {
    pushText(sanitizeReceiptText(item.name || 'Item'));
    const right = `${item.qty ?? 0}  ${money(item.lineTotal)}`;
    if (item.variantLabel) {
      pushText(padLine(`  ${item.variantLabel}`, right));
    } else {
      pushText(padLine('', right));
    }
    if (item.skuCode) pushText(`  SKU: ${item.skuCode}`);
  }

  pushText(sep);
  pushText(padLine('Sub Total', money(gst)));
  pushText('');
  if (exa > 0) pushText(padLine('Exchange (Optional)', `-${money(exa)}`));
  if (discount > 0) pushText(padLine('Discount (Optional)', `-${money(discount)}`));
  if (vat > 0) pushText(padLine('VAT (Optional)', money(vat)));
  if (tax > 0) pushText(padLine('Tax (Optional)', money(tax)));
  pushText(sep);
  pushText(padLine('Net Payable', money(total)));
  pushText('');

  if (payments.length) {
    pushText('Payment:');
    for (const p of payments) {
      pushText(padLine(p.paymentMethod || 'payment', money(p.amount)));
    }
  }

  pushText(sep);
  pushText(padLine('Due', money(due)));
  pushText(sep);

  if (receipt.amountInWords) {
    pushText(sanitizeReceiptText(receipt.amountInWords));
  }
  if (receipt.preparedBy) {
    pushText(`Seller: ${sanitizeReceiptText(receipt.preparedBy)}`);
  }
  if (receipt.store?.footer) {
    for (const wrapped of wrapText(receipt.store.footer)) {
      pushText(centerText(wrapped), 1);
    }
  }

  chunks.push(0x0a, 0x0a, 0x0a, GS, 0x56, 0x41, 0x10);
  return new Uint8Array(chunks);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export type InvoicePrintMode = 'laser_a5' | 'a4';

export function renderInvoiceHtml(receipt: ReceiptPayload, mode: InvoicePrintMode = 'laser_a5') {
  if (mode === 'a4') {
    return renderInvoiceA4(receipt as any);
  }
  return renderReceipt(receipt as any, 'laser_a5');
}

export function openInvoicePrintWindow(receipt: ReceiptPayload, mode: InvoicePrintMode = 'laser_a5') {
  if (typeof document === 'undefined') {
    return false;
  }
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.srcdoc = renderInvoiceHtml(receipt, mode);
  document.body.appendChild(iframe);

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 1200);
  };

  iframe.onload = () => {
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    cleanup();
  };
  return true;
}

export async function printReceipt(receipt: ReceiptPayload, printerName?: string, baseUrl = DEFAULT_PRINT_AGENT_URL) {
  const response = await fetch(`${baseUrl}/print/raw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      printerName,
      base64: bytesToBase64(await buildEscPosReceipt(receipt)),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    const fallbackResponse = await fetch(`${baseUrl}/print/receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printerName,
        text: formatReceiptText(receipt),
      }),
    });
    if (fallbackResponse.ok) {
      return fallbackResponse.json().catch(() => ({ ok: true }));
    }
    throw new Error(payload?.error || `Receipt print failed with ${response.status}`);
  }

  return response.json().catch(() => ({ ok: true }));
}

export function downloadReceiptHtml(receipt: ReceiptPayload, mode: InvoicePrintMode = 'laser_a5') {
  const saleNo = receipt.invoiceNo || receipt.saleNo || 'receipt';
  const html = renderInvoiceHtml(receipt, mode);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${saleNo}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function printLabel(payload: {
  text: string;
  printerName?: string;
}, baseUrl = DEFAULT_PRINT_AGENT_URL) {
  const response = await fetch(`${baseUrl}/print/label`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(result?.error || `Label print failed with ${response.status}`);
  }

  return response.json().catch(() => ({ ok: true }));
}

export type ProductLabelPayload = {
  sku: string;
  productName: string;
  storeName: string;
  sellingPrice?: number | null;
  printerName?: string;
  widthMm?: number;
  heightMm?: number;
  gap?: number;
  barcodeType?: string;
  copies?: number;
  border?: boolean;
};

export async function printProductLabel(
  payload: ProductLabelPayload,
  baseUrl = DEFAULT_PRINT_AGENT_URL,
) {
  const response = await fetch(`${baseUrl}/print/label-product`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(result?.error || `Product label print failed with ${response.status}`);
  }

  return response.json().catch(() => ({ ok: true }));
}

export type BatchLabelPayload = {
  items: Array<{
    sku: string;
    productName: string;
    storeName: string;
    sellingPrice?: number | null;
    copies?: number;
  }>;
  printerName?: string;
  widthMm?: number;
  heightMm?: number;
  gap?: number;
  barcodeType?: string;
  copies?: number;
  border?: boolean;
};

export async function printProductLabelBatch(
  payload: BatchLabelPayload,
  baseUrl = DEFAULT_PRINT_AGENT_URL,
) {
  const response = await fetch(`${baseUrl}/print/label-product-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(result?.error || `Batch label print failed with ${response.status}`);
  }

  return response.json().catch(() => ({ ok: true }));
}

export async function printTsplLabel(
  payload: { base64: string; printerName?: string },
  baseUrl = DEFAULT_PRINT_AGENT_URL,
) {
  const response = await fetch(`${baseUrl}/print/label-tspl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(result?.error || `TSPL label print failed with ${response.status}`);
  }

  return response.json().catch(() => ({ ok: true }));
}

export async function openCashDrawer(payload: {
  printerName?: string;
  pin?: 2 | 5;
}, baseUrl = DEFAULT_PRINT_AGENT_URL) {
  const response = await fetch(`${baseUrl}/hardware/drawer-open`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(result?.error || `Cash drawer failed with ${response.status}`);
  }

  return response.json().catch(() => ({ ok: true }));
}
