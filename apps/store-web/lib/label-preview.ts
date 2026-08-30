/**
 * Canvas-based WYSIWYG label renderer for barcode labels.
 * Renders at native 203 DPI printer resolution for pixel-perfect preview.
 * Used by the barcode page for real-time label preview.
 */

import JsBarcode from 'jsbarcode';

export type LabelSymbology = 'CODE128' | 'EAN13' | 'UPCA' | 'QR';

export interface LabelData {
  sku: string;
  productName: string;
  storeName: string;
  sellingPrice?: number | null;
  barcode?: string | null;
}

export interface LabelRenderOptions {
  widthMm: number;
  heightMm: number;
  dpi?: number;
  symbology: LabelSymbology;
  showStore?: boolean;
  showName?: boolean;
  showSellingPrice?: boolean;
  showBarcode?: boolean;
  showBarcodeNumber?: boolean;
  showBorder?: boolean;
}

const mmToPx = (mm: number, dpi: number) => Math.round((mm * dpi) / 25.4);

/**
 * Renders a product label onto an HTMLCanvasElement at native printer resolution.
 * The canvas width/height equals physical printer dots (203 DPI default).
 */
export function renderLabelToCanvas(
  canvas: HTMLCanvasElement,
  data: LabelData,
  opts: LabelRenderOptions,
): HTMLCanvasElement {
  const dpi = opts.dpi ?? 203;
  const w = mmToPx(opts.widthMm, dpi);
  const h = mmToPx(opts.heightMm, dpi);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const margin = mmToPx(1.0, dpi);
  const maxW = w - margin * 2;
  let y = margin;

  if (opts.showBorder) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1, Math.round(dpi / 203));
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  function fitSize(
    text: string,
    maxWidth: number,
    startSize: number,
    minSize: number,
    weight: string,
  ): number {
    let size = startSize;
    ctx!.font = `${weight} ${size}px Arial`;
    while (size > minSize && ctx!.measureText(text).width > maxWidth) {
      size -= 1;
      ctx!.font = `${weight} ${size}px Arial`;
    }
    return size;
  }

  // 1. Store name (centered, bold)
  if (opts.showStore !== false && data.storeName) {
    const label = data.storeName.toUpperCase();
    const size = fitSize(label, maxW, mmToPx(2.8, dpi), mmToPx(1.6, dpi), '700');
    ctx.font = `700 ${size}px Arial`;
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, (w - tw) / 2, y + mmToPx(0.6, dpi));
    y += size + mmToPx(0.5, dpi) + mmToPx(0.6, dpi);
  }

  // 2. Product name (centered, semibold)
  if (opts.showName !== false && data.productName) {
    const nameSize = mmToPx(2.2, dpi);
    ctx.font = `600 ${nameSize}px Arial`;
    let name = data.productName;
    if (ctx.measureText(name).width > maxW) {
      while (name.length > 1 && ctx.measureText(name + '\u2026').width > maxW) {
        name = name.slice(0, -1);
      }
      name = name.length < data.productName.length ? name + '\u2026' : name;
    }
    const tw = ctx.measureText(name).width;
    ctx.fillText(name, (w - tw) / 2, y);
    y += nameSize + mmToPx(0.6, dpi);
  }

  // 3. Selling price (centered)
  if (opts.showSellingPrice !== false && data.sellingPrice != null && data.sellingPrice > 0) {
    const priceText = `Price- ${Number(data.sellingPrice).toLocaleString()}`;
    const priceSize = fitSize(priceText, maxW, mmToPx(2.0, dpi), mmToPx(1.4, dpi), '600');
    ctx.font = `600 ${priceSize}px Arial`;
    const tw = ctx.measureText(priceText).width;
    ctx.fillText(priceText, (w - tw) / 2, y);
    y += priceSize + mmToPx(0.5, dpi);
  }

  // 4. Barcode image + human-readable number
  if (opts.showBarcode !== false && data.sku) {
    if (opts.symbology === 'QR') {
      // QR is handled natively by the printer (TSPL QRCODE command)
      // For canvas preview, we skip QR rendering here
    } else {
      const format =
        opts.symbology === 'EAN13' ? 'EAN13' : opts.symbology === 'UPCA' ? 'UPCA' : 'CODE128';
      const bcHeight = mmToPx(opts.heightMm * 0.28, dpi);

      let bcCanvas: HTMLCanvasElement | null = null;
      for (let moduleWidth = 2.2; moduleWidth >= 0.8; moduleWidth -= 0.1) {
        const candidate = document.createElement('canvas');
        try {
          JsBarcode(candidate, data.sku, {
            format,
            width: moduleWidth,
            height: bcHeight,
            displayValue: false,
            margin: 0,
            background: '#ffffff',
          });
        } catch {
          break;
        }
        if (candidate.width <= maxW || moduleWidth <= 0.8) {
          bcCanvas = candidate;
          break;
        }
      }

      if (bcCanvas) {
        const bx = Math.max(margin, Math.round((w - bcCanvas.width) / 2));
        ctx.drawImage(bcCanvas, bx, y);
        y += bcCanvas.height + mmToPx(0.4, dpi);

        if (opts.showBarcodeNumber !== false) {
          const numSize = fitSize(data.sku, maxW, mmToPx(2.0, dpi), mmToPx(1.5, dpi), '400');
          ctx.font = `400 ${numSize}px "Courier New", monospace`;
          const tw = ctx.measureText(data.sku).width;
          ctx.fillText(data.sku, (w - tw) / 2, y);
        }
      }
    }
  } else if (opts.showBarcodeNumber !== false && data.sku) {
    const numSize = fitSize(data.sku, maxW, mmToPx(2.0, dpi), mmToPx(1.5, dpi), '400');
    ctx.font = `400 ${numSize}px "Courier New", monospace`;
    const tw = ctx.measureText(data.sku).width;
    ctx.fillText(data.sku, (w - tw) / 2, y);
  }

  return canvas;
}
