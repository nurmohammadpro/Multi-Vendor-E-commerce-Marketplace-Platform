/**
 * TSPL command builder for label printers (TSC-compatible).
 * Supports: XP-420B, TSC TE244, GP-3120TUD, and similar 203 DPI printers.
 *
 * Usage:
 *   const label = new TsplBuilder(40, 25)
 *     .text("Product Name", 10, 10, { bold: true })
 *     .barcode("SKU-001", 10, 40, "128", { height: 40 })
 *     .build();
 *   // label is a Uint8Array ready to send to the printer
 */

const CRLF = '\r\n';

function esc(s) {
  return String(s).replace(/"/g, '""');
}

class TsplBuilder {
  constructor(labelWidthMm, labelHeightMm, gapMm = 3) {
    this.chunks = [];
    this.pushLine(`SIZE ${labelWidthMm} mm, ${labelHeightMm} mm`);
    this.pushLine(`GAP ${gapMm} mm, 0 mm`);
    this.pushLine('CLS');
  }

  pushLine(content) {
    this.chunks.push(content + CRLF);
  }

  text(content, x, y, opts = {}) {
    const font = opts.bold ? '8' : opts.font || '2';
    const rot = opts.rotation || 0;
    const xs = opts.xScale || 1;
    const ys = opts.yScale || 1;
    this.pushLine(`TEXT ${x},${y},"${font}",${rot},${xs},${ys},"${esc(content)}"`);
    return this;
  }

  barcode(data, x, y, type = '128', opts = {}) {
    const h = opts.height || 40;
    const human = opts.human !== false ? 1 : 0;
    const rot = opts.rotation || 0;
    const n = opts.narrow || 2;
    const w = opts.wide || 5;
    this.pushLine(`BARCODE ${x},${y},"${type}",${h},${human},${rot},${n},${w},"${esc(data)}"`);
    return this;
  }

  qr(data, x, y, opts = {}) {
    const ecc = opts.ecc || 'M';
    const cell = opts.wide || 4;
    const mode = opts.mode || 'A';
    const rot = opts.rotation || 0;
    this.pushLine(`QRCODE ${x},${y},"${mode}",${cell},${rot},"${esc(data)}"`);
    return this;
  }

  box(x1, y1, x2, y2, thickness = 1) {
    this.pushLine(`BOX ${x1},${y1},${x2},${y2},${thickness}`);
    return this;
  }

  line(x1, y1, x2, y2, thickness = 1) {
    this.pushLine(`LINE ${x1},${y1},${x2},${y2},${thickness}`);
    return this;
  }

  /**
   * Embed a 1-bit monochrome bitmap.
   * data: Uint8Array of widthBytes * heightPx bytes, MSB-first.
   */
  bitmap(x, y, widthBytes, heightPx, data, mode = 0) {
    this.chunks.push(`BITMAP ${x},${y},${widthBytes},${heightPx},${mode},`);
    // Append raw bitmap bytes (no CRLF before data)
    if (data instanceof Uint8Array) {
      // Convert to comma-separated byte values for TSPL
      const bytes = [];
      for (let i = 0; i < data.length; i++) {
        bytes.push(data[i]);
      }
      this.chunks.push(Buffer.from(bytes));
    }
    this.chunks.push(CRLF);
    return this;
  }

  sound(length = 50, interval = 200) {
    this.pushLine(`SOUND ${length},${interval}`);
    return this;
  }

  /**
   * Build the final TSPL byte stream.
   * @param {number} copies - Number of label copies to print
   * @returns {Buffer} Raw bytes ready for the printer
   */
  build(copies = 1) {
    this.pushLine(`PRINT ${copies},1`);
    return Buffer.concat(this.chunks.map(c => {
      if (typeof c === 'string') return Buffer.from(c, 'utf8');
      return c;
    }));
  }
}

/**
 * Build a complete product barcode label as TSPL commands.
 *
 * Layout (40x25mm label):
 *   1. Store name (centered, bold)
 *   2. Product name (centered)
 *   3. SKU / barcode number
 *   4. Selling price
 *   5. Barcode image (CODE128)
 *   6. Human-readable barcode number
 *
 * @param {object} data
 * @param {string} data.sku - SKU code or barcode value
 * @param {string} data.productName - Product name
 * @param {string} data.storeName - Store name
 * @param {number} [data.sellingPrice] - Selling price
 * @param {object} opts
 * @param {number} [opts.widthMm=40] - Label width in mm
 * @param {number} [opts.heightMm=25] - Label height in mm
 * @param {number} [opts.gap=3] - Gap between labels in mm
 * @param {string} [opts.barcodeType='128'] - Barcode symbology
 * @param {number} [opts.copies=1] - Number of copies
 * @param {boolean} [opts.border=false] - Draw border around label
 * @returns {Buffer} TSPL bytes
 */
function buildProductLabel(data, opts = {}) {
  const width = opts.widthMm || 40;
  const height = opts.heightMm || 25;
  const gap = opts.gap || 3;
  const bcType = opts.barcodeType || '128';
  const copies = opts.copies || 1;

  const lb = new TsplBuilder(width, height, gap);

  // DPI-based calculations (203 DPI)
  const dpi = 203;
  const mmToDots = (mm) => Math.round((mm * dpi) / 25.4);
  const wDots = mmToDots(width);
  const hDots = mmToDots(height);
  const margin = mmToDots(1.0);
  const lineH = Math.round((dpi / 25.4) * 2.8); // ~2.8mm per line

  // Optional border
  if (opts.border) {
    lb.box(0, 0, wDots - 1, hDots - 1, 1);
  }

  let y = margin + mmToDots(0.6);

  // 1. Store name (centered, bold)
  if (data.storeName) {
    const storeW = data.storeName.length * 6;
    const storeX = Math.max(margin, Math.round((wDots - storeW) / 2));
    lb.text(data.storeName.toUpperCase(), storeX, y, { font: '1' });
    y += lineH;
  }

  // 2. Product name (centered)
  if (data.productName) {
    const maxChars = Math.floor((wDots - margin * 2) / 6);
    let name = data.productName;
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '...';
    const nameX = Math.max(margin, Math.round((wDots - name.length * 6) / 2));
    lb.text(name, nameX, y, { font: '1' });
    y += lineH;
  }

  // 3. Selling price (centered)
  if (data.sellingPrice != null && data.sellingPrice > 0) {
    const priceText = `Price- ${Number(data.sellingPrice).toLocaleString()}`;
    const priceX = Math.max(margin, Math.round((wDots - priceText.length * 6) / 2));
    lb.text(priceText, priceX, y, { font: '2' });
    y += lineH;
  }

  // 4. Barcode image
  const bcHeight = Math.round(hDots * 0.28);
  const bcX = Math.max(margin, Math.round((wDots - 80) / 2));
  lb.barcode(data.sku, bcX, y, bcType, {
    height: bcHeight,
    human: false,
    narrow: 2,
    wide: 3,
  });
  y += bcHeight + mmToDots(0.4);

  // 5. Human-readable barcode number
  const skuW = data.sku.length * 6;
  const skuX = Math.max(margin, Math.round((wDots - skuW) / 2));
  lb.text(data.sku, skuX, y, { font: '2' });

  return lb.build(copies);
}

export { TsplBuilder, buildProductLabel };
