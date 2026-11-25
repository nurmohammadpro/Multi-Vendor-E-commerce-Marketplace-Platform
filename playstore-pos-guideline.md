# PlayStore POS — Web-Based POS Architecture Guide

**Goal:** Build a fast, web-based POS for PlayStore on MacBook using patterns from MarketOne (POS architecture) and AxiomPos (print agent / hardware bridge).

**Core principle:** Zero desktop app. POS runs in the browser. Hardware communication via a tiny local Node.js agent.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  MacBook                                                         │
│                                                                  │
│  ┌─────────────────────────────┐    ┌─────────────────────────┐ │
│  │  Browser (Chrome/Safari)     │    │  Print Agent (Node.js)  │ │
│  │                              │    │                         │ │
│  │  PlayStore PWA (Next.js)     │    │  localhost:17668        │ │
│  │                              │    │                         │ │
│  │  ┌───────────────────────┐  │    │  POST /print/raw ──────────> Thermal Printer
│  │  │ POS Terminal           │  │    │    (ESC/POS binary)     │ │    (USB - CUPS)
│  │  │   - Cart management   │──┼────┼──>                         │
│  │  │   - Barcode scan      │  │    │  POST /hardware/        │ │
│  │  │   - Payment capture   │  │    │    drawer-open ────────────> Cash Drawer
│  │  │   - Receipt preview   │  │    │                         │ │    (via printer)
│  │  │   - Customer lookup   │  │    │  GET /health             │ │
│  │  └───────────────────────┘  │    │  GET /hardware/status    │ │
│  │                              │    └─────────────────────────┘ │
│  │  ┌───────────────────────┐  │                                 │
│  │  │ Offline Queue         │  │  LaunchAgent auto-start:        │
│  │  │ (IndexedDB)           │  │  ~/Library/LaunchAgents/        │
│  │  └───────────────────────┘  │  com.playstore.print-agent.*    │
│  │                              │                                 │
│  │  ┌───────────────────────┐  │                                 │
│  │  │ Fallback:             │  │                                 │
│  │  │ window.print() when   │  │                                 │
│  │  │ agent unreachable     │  │                                 │
│  │  └───────────────────────┘  │                                 │
│  └─────────────┬───────────────┘                                 │
└────────────────┼─────────────────────────────────────────────────┘
                 │ API calls (HTTPS) / Sync
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  PlayStore Cloud Backend (Fastify / NestJS)                      │
│                                                                  │
│  - Products, Variants, SKUs                                      │
│  - Orders, Sales, Payments                                       │
│  - Customers, Loyalty                                            │
│  - Inventory, Stock Movements                                    │
│  - Auth (JWT tokens)                                             │
│  - Sync endpoint for offline queue                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Move POS from Electron to Web (Next.js Page)

### Step 1.1 — Create the POS page route

In your PlayStore `storefront/` app, add a POS route:

```
storefront/app/dashboard/pos/
├── page.tsx           # Main POS terminal page
├── pos-terminal.tsx   # POS terminal component (extracted from Electron)
└── pos.module.css     # POS-specific styles
```

**What to do:**
- Create `storefront/app/dashboard/pos/page.tsx` as a client component (`'use client'`)
- Import and mount your POS terminal component from `pos-desktop/src/views/PosTerminal.tsx`
- The page should require auth (check `playstore_dashboard_session` cookie via middleware)

### Step 1.2 — Refactor the POS terminal

Your existing `pos-desktop/src/views/PosTerminal.tsx` is a React component. Extract it:

1. **Remove all Electron-specific code**:
   - `window.electronAPI`, `window.electron`, `require('electron')` — these don't exist in browser
   - `ipcRenderer` calls — replace with fetch() to the backend API
   - `fs`, `path`, Node.js `Buffer` usage — not available in browser

2. **Replace Electron IPC calls** with HTTP API calls:

   | Electron IPC | Replacement |
   |---|---|
   | `window.electronAPI.getProducts()` | `fetch('/api/dashboard/products')` |
   | `window.electronAPI.createSale(data)` | `fetch('/api/dashboard/orders', { method: 'POST', body: JSON.stringify(data) })` |
   | `window.electronAPI.printReceipt(data)` | `fetch('http://127.0.0.1:17668/print/raw', { method: 'POST', body: ... })` |
   | `window.electronAPI.openDrawer()` | `fetch('http://127.0.0.1:17668/hardware/drawer-open', { method: 'POST' })` |

3. **Reference: MarketOne's POS architecture** (`apps/store-web/app/pos/pos-terminal.tsx`):

   Key patterns to follow:
   - **Cart management**: Uses a `CartItem[]` state array with `skuId`, `qty`, `unitPrice`, `lineTotal` — drop-in compatible with your existing cart logic
   - **Product search**: `POST /api/pos/search` with barcode or text query, returns `SkuSearchResult[]` with price/qty/variant info
   - **Sale submission**: `POST /api/pos/sales` with `{ store_id, register_id, shift_id, items[], payments[], customer_id? }`
   - **Register/shift management**: Open register → open shift → sell → close shift → cash count
   - **Receipt printing**: Two paths — (1) thermal via `POST /print/raw`, (2) browser print via `window.print()` on HTML receipt

4. **POS state management** (from MarketOne):

   ```typescript
   // Core states your POS needs:
   type PosState = {
     register: Register | null;       // Selected cash register
     shift: Shift | null;             // Open shift
     cart: CartItem[];                // Current sale items
     customer: Customer | null;       // Assigned customer (for due sales)
     payments: Payment[];             // Payment breakdown
     searchQuery: string;             // Live barcode/product search
   };
   ```

### Step 1.3 — Add barcode scanner support

Barcode scanners in keyboard-wedge mode just send keystrokes ending with `Enter`. This works natively in the browser.

**Reference:** AxiomPos `frontend/src/components/BarcodeScanner.jsx`

Create `storefront/components/pos/BarcodeScanner.tsx`:

```typescript
'use client';
import { useEffect, useRef } from 'react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  enabled?: boolean;
}

export function BarcodeScanner({ onScan, enabled = true }: BarcodeScannerProps) {
  const buffer = useRef('');           // Keystroke buffer
  const timeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Enter') {
        const barcode = buffer.current.trim();
        if (barcode) {
          onScan(barcode);
        }
        buffer.current = '';
        return;
      }

      // Scanners send individual characters very fast
      buffer.current += e.key;
      clearTimeout(timeout.current);
      timeout.current = setTimeout(() => { buffer.current = ''; }, 100); // Reset if slow typing
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onScan, enabled]);

  return null; // Invisible — works globally
}
```

### Step 1.4 — Add PWA support for installability

Your storefront may have partial PWA setup. Ensure:

1. **Service worker**: Already in `storefront/`? If not, add via `next-pwa` or `@serwist/next`
2. **Manifest**: Create `storefront/public/manifest.json`:
   ```json
   {
     "name": "PlayStore POS",
     "short_name": "POS",
     "start_url": "/dashboard/pos",
     "display": "standalone",
     "orientation": "landscape",
     "theme_color": "#000000",
     "background_color": "#ffffff",
     "icons": [...]
   }
   ```
3. **Offline support**: Service worker caching for API data and assets

---

## Phase 2: Print Agent (Local Hardware Bridge)

This is the key piece that enables silent thermal receipt printing from the browser.

### Step 2.1 — Create the print agent project

Create a new directory `playstore-pos/print-agent/` outside your PlayStore repo (since it runs on the local machine, not the server):

```
playstore-pos/print-agent/
├── server.js              # HTTP server + ESC/POS builder + CUPS printing
├── package.json           # No dependencies (Node.js built-ins only)
├── README.md              # Setup instructions
└── install/
    └── macos/
        ├── install.sh
        └── com.playstore.print-agent.plist
```

**`package.json`:**

```json
{
  "name": "playstore-print-agent",
  "version": "1.0.0",
  "type": "module",
  "private": true
}
```

Zero dependencies. Uses only Node.js built-in modules: `http`, `os`, `fs`, `path`, `child_process`.

### Step 2.2 — Write `server.js`

**Reference files:**
- AxiomPos: `print-agent/server.js` (full implementation — 570 lines)
- MarketOne: `print-agent/server.js` (simpler version — 302 lines)

Your agent needs these routes:

| Route | Purpose | Source Reference |
|---|---|---|
| `GET /health` | Agent availability check | AxiomPos L409-417 + MarketOne |
| `GET /hardware/status` | Hardware capabilities + version | AxiomPos L420-441 |
| `POST /print/raw` | ESC/POS binary receipt printing | AxiomPos + MarketOne |
| `POST /print/receipt` | Plain-text fallback receipt printing | MarketOne (text mode) |
| `POST /print/label` | Label printing to separate printer | MarketOne |
| `POST /hardware/drawer-open` | Cash drawer kick (pin 2 or 5) | AxiomPos L456-487 |

**Port:** `17668` (MarketOne convention — matches `DEFAULT_PRINT_AGENT_URL`)

**Key implementation details to copy from AxiomPos:**

1. **ESC/POS commands** (AxiomPos L80-113):
   ```javascript
   const escposCommands = {
     initialize:      Buffer.from([0x1b, 0x40]),
     fullCut:         Buffer.from([0x1d, 0x56, 0x42, 0x00]),
     partialCut:      Buffer.from([0x1d, 0x56, 0x66, 0x00]),
     drawerKickPin2:  Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]),
     drawerKickPin5:  Buffer.from([0x1b, 0x70, 0x01, 0x19, 0xfa]),
     boldOn:          Buffer.from([0x1b, 0x45, 0x01]),
     boldOff:         Buffer.from([0x1b, 0x45, 0x00]),
     alignLeft:       Buffer.from([0x1b, 0x61, 0x00]),
     alignCenter:     Buffer.from([0x1b, 0x61, 0x01]),
     alignRight:      Buffer.from([0x1b, 0x61, 0x02]),
     feedLines: (n) => Buffer.from([0x1b, 0x64, n]),
   };
   ```

2. **macOS CUPS printing** via `lp -o raw` (AxiomPos L146-211):
   - On macOS, CUPS utilities sometimes fail in LaunchAgent environments (restricted PATH)
   - Workaround: wrap `lp` in a login shell: `/bin/zsh -lc 'lp -o raw file.bin'`
   - Write bytes to temp file, print the file, then clean up

3. **Receipt text formatting** (AxiomPos L17-78):
   - 42-character line width (configurable via env or localStorage)
   - Center align, pair (label + value), separator, item lines
   - ASCII-only output (Bangla chars may not render on thermal printers)

4. **CORS handling** (AxiomPos L364-371):
   ```javascript
   const ALLOWED_ORIGINS = new Set([
     'http://localhost:3000',
     'http://localhost:5173',
     'https://your-production-domain.com'
   ]);
   ```

5. **Body parsing** (AxiomPos L382-397):
   - Read body chunks, enforce `MAX_BODY_BYTES = 256KB`
   - Parse as JSON

**For `/print/raw` endpoint** — combine both reference approaches:

```javascript
// 1. Build ESC/POS binary buffer (from MarketOne's buildEscPosReceipt)
// 2. Send via CUPS on macOS (from AxiomPos's printWithCups)
// 3. Fallback for Windows: PowerShell + WinSpool raw printing
// 4. Return { ok: true, printer: 'printer-name', mode: 'escpos-raw' }
```

### Step 2.3 — Create macOS LaunchAgent

**Reference:** AxiomPos `print-agent/install/macos/com.axiompos.print-agent.plist`

Create `install/macos/com.playstore.print-agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.playstore.print-agent</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/Shared/playstore-print-agent/server.js</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>WorkingDirectory</key>
  <string>/Users/Shared/playstore-print-agent</string>

  <key>StandardOutPath</key>
  <string>/Users/Shared/playstore-print-agent/agent.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/Shared/playstore-print-agent/agent.err.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PLAYSTORE_PRINT_AGENT_PORT</key>
    <string>17668</string>
    <key>PLAYSTORE_PRINTER_NAME</key>
    <string></string>
    <key>PLAYSTORE_ALLOWED_ORIGINS</key>
    <string>http://localhost:3000,http://localhost:5173</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
```

Create `install/macos/install.sh`:

```bash
#!/bin/bash
mkdir -p ~/Library/LaunchAgents
cp com.playstore.print-agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.playstore.print-agent.plist
echo "Print agent installed. Status:"
launchctl list com.playstore.print-agent
```

### Step 2.4 — Create the client-side print bridge library

**Reference:** AxiomPos `frontend/src/lib/printBridge.js` (full implementation — 379 lines)

Create `storefront/lib/print-bridge.ts`:

```typescript
const AGENT_URL = process.env.NEXT_PUBLIC_PRINT_AGENT_URL || 'http://127.0.0.1:17668';

// Types
interface ReceiptPayload {
  store_name?: string;
  store_address?: string;
  store_phone?: string;
  invoice_number?: string;
  date?: string;
  customer_name?: string;
  customer_phone?: string;
  items?: Array<{
    product_name?: string;
    quantity?: number;
    unit_price?: number;
    total_price?: number;
  }>;
  subtotal?: number;
  discount_amount?: number;
  tax_amount?: number;
  total?: number;
  paid_amount?: number;
  change_amount?: number;
  payment_method?: string;
  transaction_id?: string;
}

// 1. Check agent availability
export async function checkAgent(): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(1200),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 2. Print receipt via agent
export async function printReceipt(
  payload: ReceiptPayload,
): Promise<boolean> {
  const res = await fetch(`${AGENT_URL}/print/receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receipt: payload }),
  });
  return res.ok;
}

// 3. Fallback: browser print dialog (when agent unreachable)
export function printBrowserFallback(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1200);
  };
}

// 4. Open cash drawer
export async function openCashDrawer(pin: 2 | 5 = 2): Promise<boolean> {
  const res = await fetch(`${AGENT_URL}/hardware/drawer-open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  return res.ok;
}
```

### Step 2.5 — Receipt printing flow (in the POS)

**Reference:** MarketOne `apps/store-web/lib/print-agent.ts` functions: `printReceipt`, `openInvoicePrintWindow`, `downloadReceiptHtml`

The flow should be:

```typescript
async function handlePrintReceipt(saleData: SaleData) {
  // 1. Check if local print agent is available
  const agentAvailable = await checkAgent();

  if (agentAvailable) {
    try {
      // 2a. Silent thermal print via local agent
      await printReceipt(saleData);
      return;
    } catch {
      // If agent errors, fall through to browser print
    }
  }

  // 2b. Browser print dialog as fallback
  const html = renderReceiptHtml(saleData);
  printBrowserFallback(html);
}
```

---

## Phase 3: Offline Mode (IndexedDB)

Replace the desktop SQLite store-hub with browser-side IndexedDB.

### Step 3.1 — Set up Dexie.js (IndexedDB wrapper)

```bash
npm install dexie
```

Create `storefront/lib/offline-db.ts`:

```typescript
import Dexie, { type Table } from 'dexie';

interface OfflineCart {
  id: string;
  items: CartItem[];
  createdAt: number;
  synced: boolean;
}

interface OfflineSale {
  id: string;
  data: SaleData;
  createdAt: number;
  synced: boolean;
  syncError?: string;
}

class PlayStoreDB extends Dexie {
  carts!: Table<OfflineCart>;
  pendingSales!: Table<OfflineSale>;
  productCache!: Table<{ id: string; data: unknown; cachedAt: number }>;

  constructor() {
    super('PlayStoreOffline');
    this.version(1).stores({
      carts: 'id, synced',
      pendingSales: 'id, synced, createdAt',
      productCache: 'id, cachedAt',
    });
  }
}

export const db = new PlayStoreDB();
```

### Step 3.2 — Sync queue

When the POS submits a sale while offline, save to IndexedDB. When online, flush the queue.

```typescript
export async function queueSale(saleData: SaleData) {
  await db.pendingSales.add({
    id: crypto.randomUUID(),
    data: saleData,
    createdAt: Date.now(),
    synced: false,
  });
}

export async function syncPendingSales() {
  const pending = await db.pendingSales
    .where('synced')
    .equals(false)
    .toArray();

  for (const sale of pending) {
    try {
      const res = await fetch('/api/dashboard/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sale.data),
      });
      if (res.ok) {
        await db.pendingSales.update(sale.id, { synced: true });
      }
    } catch {
      // Will retry next sync
    }
  }
}
```

### Step 3.3 — Online/offline detection

```typescript
import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      syncPendingSales(); // Auto-sync when back online
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
```

---

## Phase 4: Integration with PlayStore Backend

### Step 4.1 — POS API endpoints needed on the backend

Your PlayStore backend (Fastify) likely already has most of these. Ensure these endpoints exist:

| Endpoint | Purpose |
|---|---|
| `GET /api/products/search?q=barcode_or_name` | Product search for POS |
| `GET /api/products/:id/variants` | Variant details |
| `POST /api/pos/sales` | Create sale |
| `GET /api/pos/shifts/active` | Get active shift |
| `POST /api/pos/shifts/open` | Open new shift |
| `POST /api/pos/shifts/:id/close` | Close shift with cash count |
| `GET /api/pos/registers` | List registers |
| `GET /api/customers/search?q=phone_or_name` | Customer lookup |
| `GET /api/dashboard/products` | Product list (with stock) |

### Step 4.2 — Receipt HTML template

**Reference:** MarketOne `apps/store-web/lib/receipt-template.js`

Create `storefront/lib/receipt-template.ts` — a function that takes sale data and returns an HTML string suitable for `window.print()`:

```typescript
export function renderReceiptHtml(sale: SaleData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page { margin: 0; size: 80mm auto; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; }
        .center { text-align: center; }
        .line { border-top: 1px dashed #000; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 1px 0; }
        .right { text-align: right; }
        .total { font-weight: bold; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="center">
        <strong>${sale.store_name}</strong><br>
        ${sale.store_address}<br>
        ${sale.store_phone}<br>
      </div>
      <div class="line"></div>
      <div>Invoice: ${sale.invoice_number}</div>
      <div>Date: ${new Date(sale.date).toLocaleString('en-BD')}</div>
      ${sale.customer_name ? `<div>Customer: ${sale.customer_name}</div>` : ''}
      <div class="line"></div>
      <table>
        <tr><td><strong>Item</strong></td>
            <td class="right"><strong>Qty</strong></td>
            <td class="right"><strong>Total</strong></td></tr>
        ${sale.items.map(item => `
          <tr><td>${item.product_name}</td>
              <td class="right">${item.quantity}</td>
              <td class="right">${item.total_price}</td></tr>
        `).join('')}
      </table>
      <div class="line"></div>
      <table>
        <tr><td>Subtotal</td><td class="right">${sale.subtotal}</td></tr>
        ${sale.discount_amount ? `<tr><td>Discount</td><td class="right">-${sale.discount_amount}</td></tr>` : ''}
        <tr class="total"><td><strong>Total</strong></td>
            <td class="right"><strong>${sale.total}</strong></td></tr>
        <tr><td>Paid</td><td class="right">${sale.paid_amount}</td></tr>
        ${sale.change_amount ? `<tr><td>Change</td><td class="right">${sale.change_amount}</td></tr>` : ''}
      </table>
      <div class="line"></div>
      <div>Payment: ${sale.payment_method}</div>
      ${sale.transaction_id ? `<div>Txn ID: ${sale.transaction_id}</div>` : ''}
      <div class="line"></div>
      <div class="center">Thank you for your purchase</div>
      <script>window.print(); window.close();</script>
    </body>
    </html>
  `;
}
```

---

## File-by-File Build Order

Build in this exact order — each step is testable independently:

| # | File | What it does | Reference |
|---|---|---|---|
| 1 | `playstore-pos/print-agent/package.json` | Zero-dep Node.js project | AxiomPos |
| 2 | `playstore-pos/print-agent/server.js` | HTTP server + ESC/POS builder + CUPS printing | AxiomPos L1-570 + MarketOne |
| 3 | `playstore-pos/print-agent/install/macos/install.sh` | LaunchAgent installer | AxiomPos |
| 4 | `playstore-pos/print-agent/install/macos/com.playstore.print-agent.plist` | macOS auto-start plist | AxiomPos |
| 5 | `playstore-pos/print-agent/README.md` | Setup guide for MacBook | — |
| 6 | `storefront/lib/print-bridge.ts` | Client-side agent communication | AxiomPos `printBridge.js` |
| 7 | `storefront/lib/receipt-template.ts` | HTML receipt for browser print fallback | MarketOne `receipt-template.js` |
| 8 | `storefront/components/pos/BarcodeScanner.tsx` | Keyboard-wedge barcode listener | AxiomPos |
| 9 | `storefront/app/dashboard/pos/page.tsx` | POS route page (Next.js) | MarketOne |
| 10 | `storefront/app/dashboard/pos/pos-terminal.tsx` | POS terminal (extracted from Electron) | MarketOne + your existing code |
| 11 | `storefront/lib/offline-db.ts` | IndexedDB for offline | Dexie docs |
| 12 | PWA manifest + service worker config | Installable offline POS | Next.js PWA docs |

---

## Configuration on MacBook

### Step 1: Install Node.js
```bash
brew install node  # Or download from nodejs.org
```

### Step 2: Set up the print agent
```bash
# Copy agent to a stable location
cp -r playstore-pos/print-agent /Users/Shared/playstore-print-agent

# Test manually first
cd /Users/Shared/playstore-print-agent
node server.js
# Visit http://127.0.0.1:17668/health in browser

# Install as LaunchAgent (auto-start on login)
cd install/macos
chmod +x install.sh
./install.sh
```

### Step 3: Install the thermal printer in macOS
1. Connect printer via USB
2. Open System Settings → Printers & Scanners
3. Add printer
4. Select "Generic ESC/P" driver (or the manufacturer's driver)
5. Note the printer name exactly as shown

### Step 4: Configure the print agent
```bash
# Set the printer name
export PLAYSTORE_PRINTER_NAME="XP-80C"
# Or edit the plist file to set it permanently
```

### Step 5: Open the POS
```
http://localhost:3000/dashboard/pos
```

---

## Key Patterns Summary

### From MarketOne (store-web architecture):
- **POS runs in Next.js browser** — no Electron, no lag
- **Register → Shift → Sale flow** — each session is tracked
- **Product search** by barcode or name with real-time SKU lookup
- **Two receipt paths**: ESC/POS thermal (silent) via local agent, HTML browser print as fallback
- **Receipt template** is a pure function: `(data) => HTML string`

### From AxiomPos (print agent):
- **Zero-dependency Node.js server** — no npm install needed
- **ESC/POS byte construction** in pure JavaScript — no library
- **macOS CUPS printing** via `lp -o raw` with LaunchAgent PATH workaround
- **Fallback to `window.print()`** when agent is unreachable
- **Barcode scanner via keyboard events** — no driver needed
- **Hardware config in localStorage** — printer name, paper width, drawer pin

### What you eliminate:
| Old (Electron) | New (Web POS) |
|---|---|
| Electron ~200MB RAM | Browser tab ~50MB |
| Desktop install/update | Refresh browser = update |
| SQLite store-hub (separate process) | IndexedDB (in-browser) |
| Tauri rewrite effort | Not needed |
| Electron IPC for printing | HTTP fetch to local agent |
| Platform-specific builds | Works on any device |
