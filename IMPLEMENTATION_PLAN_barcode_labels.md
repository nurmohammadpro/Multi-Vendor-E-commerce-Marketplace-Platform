# Barcode Label Printing — Implementation Plan

## 1. Architecture Decision: TSPL via Print-Agent

**Decision**: Send TSPL commands through the existing print-agent, NOT WebUSB direct.

**Rationale**:
- Print-agent already talks to label printers via CUPS/raw on Mac and raw on Windows
- TSPL is the native protocol for XP-420B and TSC TE244 (both in hardware catalog)
- WebUSB has Chrome-only, HTTPS-only, and user-gesture restrictions that break batch printing
- Centralizing TSPL in the print-agent means the frontend stays protocol-agnostic (just sends structured JSON)

**Label format**: 40mm × 25mm (standard thermal label size, matches reference implementation)

**Barcode symbology**: CODE128 (default), with EAN13/QR as options in label settings

---

## 2. Pipeline Placement

Barcode printing fits in **three** existing pipeline touch-points:

| Touch-point | When | What |
|---|---|---|
| **Purchases** (quickReceive) | After stock arrives | "Print labels?" prompt after successful quickReceive |
| **Catalog** (product detail) | On-demand from SKU list | "Print Label" button per SKU row in product detail panel |
| **POS** (post-sale) | After receipt prints | Already has `handlePrintLabel` — upgrade from plain text to TSPL |

The **dedicated barcode page** (`/barcodes`) is the primary batch-printing surface, matching the reference implementation.

---

## 3. Files to Create

### 3a. Print-Agent TSPL Module
**File**: `print-agent/tspl.js`

New module that builds TSPL command strings. No external deps (pure string builder).

```
Functions:
- sizeLabel(widthMm, heightMm)       → "SIZE 40 mm, 25 mm\n"
- cls()                              → "CLS\n"
- text(x, y, font, rotation, text)   → `TEXT ${x},${y},"${font}",${rotation},1,1,"${text}"\n`
- barcode(x, y, type, height, readable, barcode) → `BARCODE ${x},${y},"${type}",${height},1,0,1,"${barcode}"\n`
- qrcode(x, y, level, size, data)    → `QRCODE ${x},${y},${level},${size},A,"${data}"\n`
- print(copies)                      → `PRINT ${copies}\n`
- buildLabel(config)                 → Full label TSPL string (calls above functions)
```

Label layout for 40×25mm at 203 DPI (312×197 dots):
- Product name: top, TEXT 20,25,"2",0,1,1
- SKU code: middle, TEXT 20,65,"2",0,1,1
- Barcode: bottom-left, BARCODE 20,90,"128",50,1,0,1
- Price: bottom-right, TEXT 200,120,"2",0,1,1

### 3b. Frontend Barcode Page
**File**: `apps/store-web/app/barcodes/page.tsx`

New Next.js page (follows same pattern as `purchases/purchases-workspace.tsx`).

Components:
- Product/SKU search with `readJson('/api/catalog/skus/search?q=...')`
- SKU list table with checkbox selection (multi-select for batch print)
- Label settings panel:
  - Symbology selector (CODE128, EAN13, QR)
  - Show/hide: product name, SKU code, price, barcode text
  - Label size (locked to 40×25mm initially)
  - Copies per SKU (1–10)
- Canvas preview (40×25mm at 203 DPI)
- "Print Selected" button → calls `printTsplLabel()` with structured payload

### 3c. Frontend Label Preview Module
**File**: `apps/store-web/lib/label-preview.ts`

Canvas-based renderer (no deps, pure Canvas 2D API):
- `renderLabelPreview(canvas, options)` — draws label at 203 DPI scale
- Uses native `CanvasRenderingContext2D` for text and barcode
- Barcode drawn using JsBarcode or manual CODE128 renderer
- Returns data URL for preview

---

## 4. Files to Modify

### 4a. Print-Agent Server
**File**: `print-agent/server.js`

**Line 268–273**: Replace the existing `/print/label` endpoint with two endpoints:

```
POST /print/label          — Keep existing plain-text endpoint for backward compat
POST /print/label-tspl     — NEW: Accept structured TSPL payload, send raw bytes
```

New endpoint body:
```json
{
  "tspl": "SIZE 40 mm, 25 mm\nCLS\nTEXT ...",
  "printerName": "...",
  "copies": 1
}
```

Also: Import and wire up `tspl.js` for optional server-side label building (future use).

**Add `/print/label-batch` endpoint**: Accepts array of TSPL labels, sends them sequentially with small delays between copies.

### 4b. Print-Agent Client
**File**: `apps/store-web/lib/print-agent.ts`

**Line 492–510**: Add new function alongside existing `printLabel()`:

```typescript
export async function printTsplLabel(payload: {
  tspl: string;
  printerName?: string;
  copies?: number;
}, baseUrl?: string) { ... }

export async function printTsplBatch(payload: {
  labels: Array<{ tspl: string; copies?: number }>;
  printerName?: string;
}, baseUrl?: string) { ... }
```

Keep existing `printLabel()` unchanged for backward compat (hardware test page, POS quick print).

### 4c. POS Terminal
**File**: `apps/store-web/app/pos/pos-terminal.tsx`

**Line 829–846**: Upgrade `handlePrintLabel` to use TSPL instead of plain text:

```typescript
const handlePrintLabel = async (sku: SkuSearchResult) => {
  const tspl = buildLabel({
    productName: sku.product_name,
    skuCode: sku.sku_code,
    barcode: sku.barcode,
    price: Number(sku.sale_price ?? 0),
    widthMm: 40,
    heightMm: 25,
    symbology: 'CODE128',
  });
  await printTsplLabel({ tspl, printerName: labelPrinterName || undefined }, agentUrl);
};
```

Import `buildLabel` from the new `tspl.js` client-side equivalent (or inline the TSPL builder in `print-agent.ts`).

### 4d. Purchases Workspace
**File**: `apps/store-web/app/purchases/purchases-workspace.tsx`

After successful quickReceive response (around line 640+), add a "Print Labels?" prompt:

- The `quickReceive` API already returns `skus` array with `skuCode`, `label`, `price`
- Add a success banner: "Purchase received. Print labels for N items?"
- "Yes" button calls `printTsplBatch()` with one label per SKU
- "Skip" button dismisses

This is a simple post-action prompt, not a new page.

### 4e. Catalog Workspace
**File**: `apps/store-web/app/catalog/catalog-workspace.tsx`

In the product detail panel (SKU list around line 80–91), add a "Print Label" action per SKU row:

- Small icon button (Printer icon from lucide) in each SKU row
- On click: builds TSPL for that SKU, calls `printTsplLabel()`
- For batch: add checkboxes + "Print Selected" toolbar (similar to adjustments pattern)

### 4f. Hardware Workspace
**File**: `apps/store-web/app/hardware/hardware-workspace.tsx`

**Line 243–253**: Upgrade `testLabel()` to send a real TSPL label instead of plain text:

```typescript
const testLabel = async () => {
  const tspl = buildLabel({
    productName: 'Test Product',
    skuCode: 'HW-TEST',
    barcode: '2000000001234',
    price: 0,
    widthMm: 40,
    heightMm: 25,
  });
  await printTsplLabel({ tspl, printerName: labelPrinterName || undefined }, effectiveAgentUrl);
};
```

### 4g. Navigation
**File**: `apps/store-web/app/page.tsx`

**Line 31–35**: Add barcode page to quick actions:

```typescript
{ href: '/barcodes', group: 'Product & Stock', title: 'Barcode Labels', detail: 'Print barcode labels for products and SKUs.', icon: Barcode, feature: 'purchases' },
```

Import `Barcode` from lucide-react.

### 4h. API — SKU Search Enhancement
**File**: `apps/api/src/modules/catalog/catalog.controller.ts`

**Line 277–292**: The existing `searchSkus` endpoint already returns everything needed (barcode, sku_code, product_name, sale_price). No changes needed for basic label printing.

**Optional enhancement**: Add `GET /api/catalog/skus/:skuId/label-data` endpoint that returns a denormalized label payload (product name, sku code, barcode, price, brand, category) in one query. This avoids the frontend stitching together label data from search results.

### 4i. Store-Ops Service
**File**: `apps/api/src/modules/store-ops/store-ops.service.ts`

**Line 2666–2669**: The `quickReceive` return already includes `skus` array with `skuCode`, `label`, `price`. For label printing, we also need `barcode` and `productName` in the response. Currently the response only has:

```typescript
return {
  product: { id: productId, name: productName, productCode },
  purchase: { id: purchaseId, purchaseNo, totalAmount, paidAmount },
  skus,  // ← has skuCode, label, price, cost, qty but NOT barcode
};
```

**Fix**: Add `barcode` to the `skus` array items. Change the `skus.push()` calls at lines 2601 and 2619 to include `barcode`:

```typescript
// Line 2601 (variant path):
skus.push({ id: ..., skuCode, label, price, cost, qty: 1, barcode: vBarcode });

// Line 2619 (non-variant path):
skus.push({ id: ..., skuCode, label: null, price: ..., cost: ..., qty: ..., barcode });
```

---

## 5. Database Changes

**None required for MVP.**

Label printing is stateless — the frontend builds TSPL, sends it to print-agent, print-agent sends raw bytes to the printer. No job queue, no label templates table.

**Future consideration**: If we need print job history or retry logic, add a `label_print_jobs` table modeled after `sales.sale_print_jobs` (migration 0022).

---

## 6. API Endpoints Needed

| Endpoint | Method | Purpose | Status |
|---|---|---|---|
| `POST /print/label` | POST | Plain text label (existing) | Keep as-is |
| `POST /print/label-tspl` | POST | TSPL label bytes | **New** |
| `POST /print/label-batch` | POST | Batch TSPL labels | **New** |
| `GET /api/catalog/skus/search` | GET | Search SKUs for barcode page | Already exists |
| `GET /api/catalog/skus/:skuId/label-data` | GET | Denormalized label payload | **Optional** |

---

## 7. Frontend Components

| Component | Location | Purpose |
|---|---|---|
| `BarcodePage` | `app/barcodes/page.tsx` | Main barcode label page |
| `LabelPreview` | `lib/label-preview.ts` | Canvas-based label renderer |
| `SkuSearchTable` | Inside `page.tsx` | Search + multi-select SKU list |
| `LabelSettings` | Inside `page.tsx` | Symbology, show/hide, copies |
| `PrintLabelButton` | `components/print-label-button.tsx` | Reusable "print label" icon button (used in catalog, POS) |

---

## 8. Implementation Order

### Phase 1: TSPL Core (print-agent)
1. Create `print-agent/tspl.js` — TSPL command builder
2. Add `POST /print/label-tspl` endpoint to `print-agent/server.js`
3. Add `printTsplLabel()` and `printTsplBatch()` to `apps/store-web/lib/print-agent.ts`
4. Upgrade `testLabel()` in `hardware-workspace.tsx` to use TSPL

**Verify**: Hardware test page prints a real barcode label

### Phase 2: SKU Data Fix
5. Fix `quickReceive` response to include `barcode` in `skus` array (`store-ops.service.ts:2601,2619`)
6. Verify `searchSkus` returns all label-needed fields (it does)

### Phase 3: Barcode Page
7. Create `apps/store-web/lib/label-preview.ts` — canvas renderer
8. Create `apps/store-web/app/barcodes/page.tsx` — full barcode page
9. Add `/barcodes` to navigation in `page.tsx`

### Phase 4: Integration Points
10. Upgrade `handlePrintLabel` in `pos-terminal.tsx` to use TSPL
11. Add "Print Label" button to catalog SKU rows in `catalog-workspace.tsx`
12. Add "Print Labels?" prompt after quickReceive in `purchases-workspace.tsx`

### Phase 5: Polish
13. Add label size selector (40×25mm default, 50×30mm, 50×40mm options)
14. Add EAN13 and QR code symbology options
15. Add "reprint last label" shortcut in POS terminal

---

## 9. TSPL Command Reference (for tspl.js)

```
SIZE 40 mm, 25 mm
CLS
TEXT 20,25,"2",0,1,1,"Product Name Here"
TEXT 20,65,"2",0,1,1,"SKU-CODE-123"
BARCODE 20,90,"128",50,1,0,1,"2000000001234"
TEXT 200,120,"2",0,1,1,"৳1,250"
PRINT 1
```

Key TSPL fields:
- `SIZE width mm, height mm` — label dimensions
- `TEXT x,y,"font",rotation,horizontal,vertical,"content"` — font "2" = 16×16 dots
- `BARCODE x,y,"type",height,readable,rotation,narrow,width,"data"` — type "128" = CODE128
- `QRCODE x,y,level,version,mode,"data"` — QR code
- `PRINT copies` — eject label

---

## 10. Key Constraints

- **No new npm dependencies** — barcode rendering uses Canvas 2D API (browser-native)
- **No database changes** — stateless printing
- **No new API modules** — reuse existing catalog endpoints
- **Inline styles with marketone-theme** — all new UI follows existing patterns
- **Backward compatible** — existing `printLabel()` plain-text endpoint stays for hardware test page
