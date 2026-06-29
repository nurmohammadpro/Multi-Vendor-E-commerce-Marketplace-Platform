export const DEFAULT_PRINT_AGENT_URL =
  process.env.NEXT_PUBLIC_PRINT_AGENT_URL || 'http://127.0.0.1:17658';

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

export type ReceiptPayload = {
  saleId?: string | null;
  saleNo?: string | null;
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
    qty?: number;
    unitPrice?: number;
    lineTotal?: number;
  }>;
  totals?: {
    subtotal?: number;
    discount?: number;
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
  }>;
  printedAt?: string | null;
};

const money = (value: number | undefined | null) => Number(value ?? 0).toFixed(2);
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

export function formatReceiptText(receipt: ReceiptPayload) {
  const lines = [
    receipt.store?.name || 'Store',
    receipt.saleNo ? `Receipt: ${receipt.saleNo}` : 'Receipt',
    receipt.printedAt ? `Printed: ${new Date(receipt.printedAt).toLocaleString()}` : null,
    receipt.customer?.name ? `Customer: ${receipt.customer.name}` : null,
    receipt.customer?.phone ? `Phone: ${receipt.customer.phone}` : null,
    receipt.customer?.email ? `Email: ${receipt.customer.email}` : null,
    receipt.customer?.shopName ? `Shop: ${receipt.customer.shopName}` : null,
    receipt.customer?.address ? `Address: ${receipt.customer.address}` : null,
    '------------------------------',
    ...(receipt.items ?? []).flatMap((item) => [
      item.name || 'Item',
      `${item.qty ?? 0} x ${money(item.unitPrice)} = ${money(item.lineTotal)}`,
      item.skuCode ? `SKU: ${item.skuCode}` : null,
    ]),
    '------------------------------',
    `Subtotal: ${money(receipt.totals?.subtotal)}`,
    `Discount: ${money(receipt.totals?.discount)}`,
    `Tax: ${money(receipt.totals?.tax)}`,
    `Shipping: ${money(receipt.totals?.shipping)}`,
    `Total: ${money(receipt.totals?.total)}`,
    `Paid: ${money(receipt.totals?.paid)}`,
    `Due: ${money(receipt.totals?.due)}`,
    `Change: ${money(receipt.totals?.change)}`,
    ...(receipt.payments?.length
      ? [
          '------------------------------',
          ...receipt.payments.map(
            (payment) =>
              `${payment.paymentMethod || 'payment'}${payment.status ? ` (${payment.status})` : ''}: ${money(payment.amount)}`,
          ),
        ]
      : []),
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
  pushText('-'.repeat(RECEIPT_COLUMNS));
  pushText(receipt.saleNo ? padLine('Receipt', receipt.saleNo) : 'Receipt');
  pushText(`Printed: ${sanitizeReceiptText(receipt.printedAt ? new Date(receipt.printedAt).toLocaleString() : new Date().toLocaleString())}`);
  if (receipt.customer?.name) pushText(`Customer: ${receipt.customer.name}`);
  if (receipt.customer?.phone) pushText(`Phone: ${receipt.customer.phone}`);
  if (receipt.customer?.shopName) pushText(`Shop: ${receipt.customer.shopName}`);
  if (receipt.customer?.address) {
    for (const wrapped of wrapText(`Address: ${receipt.customer.address}`)) {
      pushText(wrapped);
    }
  }
  pushText('-'.repeat(RECEIPT_COLUMNS));

  for (const item of receipt.items ?? []) {
    pushText(sanitizeReceiptText(item.name || 'Item'));
    pushText(padLine(`${Number(item.qty ?? 0)} x ${money(item.unitPrice)}`, money(item.lineTotal)));
    if (item.skuCode) pushText(`SKU: ${item.skuCode}`);
  }

  pushText('-'.repeat(RECEIPT_COLUMNS));
  pushText(padLine('Subtotal', money(receipt.totals?.subtotal)));
  pushText(padLine('Discount', money(receipt.totals?.discount)));
  pushText(padLine('Tax', money(receipt.totals?.tax)));
  pushText(padLine('Shipping', money(receipt.totals?.shipping)));
  pushText(padLine('Total', money(receipt.totals?.total)));
  pushText(padLine('Paid', money(receipt.totals?.paid)));
  pushText(padLine('Due', money(receipt.totals?.due)));
  if ((receipt.totals?.change ?? 0) > 0) {
    pushText(padLine('Change', money(receipt.totals?.change)));
  }
  if (receipt.payments?.length) {
    pushText('-'.repeat(RECEIPT_COLUMNS));
    for (const payment of receipt.payments) {
      pushText(
        padLine(
          `${payment.paymentMethod || 'payment'}${payment.status ? ` (${payment.status})` : ''}`,
          money(payment.amount),
        ),
      );
    }
  }
  if (receipt.store?.footer) {
    pushText('-'.repeat(RECEIPT_COLUMNS));
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

export function renderInvoiceHtml(receipt: ReceiptPayload) {
  const storeMeta = [
    receipt.store?.phone,
    receipt.store?.email,
    receipt.store?.address,
  ].filter(Boolean) as string[];

  const itemRows = (receipt.items ?? [])
    .map((item) => `
      <tr>
        <td>${escapeHtml(item.name || 'Item')}</td>
        <td>${escapeHtml(item.skuCode || '—')}</td>
        <td>${Number(item.qty ?? 0)}</td>
        <td>${money(item.unitPrice)}</td>
        <td>${money(item.lineTotal)}</td>
      </tr>
    `)
    .join('');

  const payments = (receipt.payments ?? [])
    .map((payment) => `
      <li>${escapeHtml(payment.paymentMethod || 'payment')}${payment.status ? ` (${escapeHtml(payment.status)})` : ''}: ${money(payment.amount)}</li>
    `)
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(receipt.saleNo || 'Invoice')}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      .page { max-width: 820px; margin: 0 auto; background: #fff; padding: 32px; }
      .header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
      .brand { display: flex; gap: 16px; align-items: center; }
      .brand-logo { width: 72px; height: 72px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; padding: 6px; }
      .brand-name { font-size: 24px; font-weight: 700; margin: 0 0 6px; }
      .brand-meta { margin: 0; color: #475569; font-size: 13px; line-height: 1.5; }
      .invoice-meta { text-align: right; }
      .invoice-title { margin: 0 0 8px; font-size: 28px; font-weight: 700; }
      .section { margin-top: 24px; }
      .section h2 { margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: left; }
      th { color: #475569; font-weight: 600; background: #f8fafc; }
      .totals { margin-left: auto; width: 320px; }
      .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
      .totals-row.total { font-size: 18px; font-weight: 700; border-bottom: 0; padding-top: 14px; }
      .customer, .payments { color: #334155; font-size: 14px; line-height: 1.6; }
      @media print {
        body { background: #fff; }
        .page { max-width: none; margin: 0; padding: 20px; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <div class="brand">
          ${receipt.store?.logoUrl ? `<img src="${escapeHtml(receipt.store.logoUrl)}" alt="Store logo" class="brand-logo" />` : ''}
          <div>
            <p class="brand-name">${escapeHtml(receipt.store?.name || 'Store')}</p>
            ${storeMeta.map((line) => `<p class="brand-meta">${escapeHtml(line)}</p>`).join('')}
          </div>
        </div>
        <div class="invoice-meta">
          <p class="invoice-title">Invoice</p>
          <p class="brand-meta">No: ${escapeHtml(receipt.saleNo || '—')}</p>
          <p class="brand-meta">Printed: ${escapeHtml(receipt.printedAt ? new Date(receipt.printedAt).toLocaleString() : new Date().toLocaleString())}</p>
        </div>
      </div>

      <div class="section">
        <h2>Customer</h2>
        <div class="customer">
          <div>${escapeHtml(receipt.customer?.name || 'Walk-in customer')}</div>
          ${receipt.customer?.phone ? `<div>${escapeHtml(receipt.customer.phone)}</div>` : ''}
          ${receipt.customer?.email ? `<div>${escapeHtml(receipt.customer.email)}</div>` : ''}
          ${receipt.customer?.shopName ? `<div>${escapeHtml(receipt.customer.shopName)}</div>` : ''}
          ${receipt.customer?.address ? `<div>${escapeHtml(receipt.customer.address)}</div>` : ''}
        </div>
      </div>

      <div class="section">
        <h2>Items</h2>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>

      <div class="section totals">
        <div class="totals-row"><span>Subtotal</span><span>${money(receipt.totals?.subtotal)}</span></div>
        <div class="totals-row"><span>Discount</span><span>${money(receipt.totals?.discount)}</span></div>
        <div class="totals-row"><span>Tax</span><span>${money(receipt.totals?.tax)}</span></div>
        <div class="totals-row"><span>Shipping</span><span>${money(receipt.totals?.shipping)}</span></div>
        <div class="totals-row"><span>Paid</span><span>${money(receipt.totals?.paid)}</span></div>
        <div class="totals-row"><span>Due</span><span>${money(receipt.totals?.due)}</span></div>
        <div class="totals-row total"><span>Total</span><span>${money(receipt.totals?.total)}</span></div>
      </div>

      ${payments ? `<div class="section"><h2>Payments</h2><ul class="payments">${payments}</ul></div>` : ''}
      ${receipt.store?.footer ? `<div class="section"><h2>Footer</h2><div class="customer">${escapeHtml(receipt.store.footer)}</div></div>` : ''}
    </div>
  </body>
</html>`;
}

export function openInvoicePrintWindow(receipt: ReceiptPayload) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    throw new Error('Popup blocked while opening the invoice window.');
  }

  printWindow.document.open();
  printWindow.document.write(renderInvoiceHtml(receipt));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
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
