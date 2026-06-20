# POS Print Integration

## Purpose

This document defines how the store POS frontend should integrate with the local print agent for:

- silent receipt printing
- barcode and label printing
- health detection
- fallback behavior

This applies to:

- cashier workflows
- manager workflows
- Windows workstation setups
- macOS workstation setups

---

## Core Rule

The web app must treat local printing as a **workstation capability**, not a VPS capability.

So the integration path is:

```text
Store Web POS
-> localhost print-agent health check
-> local print-agent print endpoint
-> local receipt or label printer
```

If that path is unavailable, the app should fall back safely instead of blocking checkout.

---

## Local Agent Base URL

Default agent URL:

```text
http://127.0.0.1:17658
```

Recommended frontend config:

- `NEXT_PUBLIC_PRINT_AGENT_URL=http://127.0.0.1:17658`
- allow store-level override later if needed

---

## Endpoints

### Health

`GET /health`

Purpose:

- detect whether silent printing is available
- show cashier-facing printer readiness state

Expected response:

```json
{
  "ok": true,
  "service": "multivendor-print-agent",
  "port": 17658,
  "platform": "win32",
  "printerName": "XP-Q80A",
  "labelPrinterName": "XP-420B"
}
```

### Silent Receipt Print

`POST /print/receipt`

Purpose:

- print a sales receipt without browser print dialog

### Silent Label Print

`POST /print/label`

Purpose:

- print barcode or product labels from the local workstation

---

## Receipt Payload Contract

Minimum supported payload:

```json
{
  "text": "Invoice #1001\nProduct A x1\nTotal: 500.00"
}
```

Recommended production payload:

```json
{
  "printerName": "XP-Q80A",
  "text": "My Store\nInvoice #1001\nDate: 2026-06-21 14:00\n--------------------------\nProduct A x1 500.00\n--------------------------\nTotal 500.00\nPaid 500.00\nThank you"
}
```

Recommended frontend-generated structure before formatting:

```json
{
  "saleId": "uuid",
  "saleNo": "SALE-1001",
  "store": {
    "name": "My Store",
    "address": "Dhaka",
    "phone": "01XXXXXXXXX"
  },
  "customer": {
    "name": "Walk-in Customer",
    "phone": null
  },
  "items": [
    {
      "name": "Product A",
      "skuCode": "SKU-001",
      "qty": 1,
      "unitPrice": 500,
      "lineTotal": 500
    }
  ],
  "totals": {
    "subtotal": 500,
    "discount": 0,
    "tax": 0,
    "shipping": 0,
    "total": 500,
    "paid": 500,
    "change": 0
  },
  "paymentMethod": "cash",
  "printedAt": "2026-06-21T14:00:00.000Z"
}
```

Frontend responsibility:

- convert structured receipt data into printable text or raw print payload
- keep the print payload stable even if UI layout changes

---

## Label Payload Contract

Minimum supported payload:

```json
{
  "text": "Product A\nSKU-001\nPrice: 500"
}
```

Recommended production payload:

```json
{
  "printerName": "XP-420B",
  "text": "Product A\nSKU-001\nBarcode: 1234567890123\nPrice: 500"
}
```

Recommended future-ready structure:

```json
{
  "labelType": "product_barcode",
  "printerName": "XP-420B",
  "product": {
    "name": "Product A",
    "skuCode": "SKU-001",
    "barcode": "1234567890123",
    "price": 500
  },
  "copies": 1,
  "size": {
    "widthMm": 50,
    "heightMm": 30
  }
}
```

---

## Frontend Print Flow

### Receipt Print Flow

```text
cashier completes POS sale
-> backend confirms sale commit
-> frontend shows receipt modal
-> frontend checks local print-agent health
-> if healthy, POST /print/receipt
-> if success, show "Printed"
-> if failed, show fallback options
```

### Label Print Flow

```text
user selects product label print
-> frontend checks local print-agent health
-> if healthy, POST /print/label
-> if success, show confirmation
-> if failed, show fallback/manual path
```

---

## Health Check Strategy

### On POS Screen Load

The POS UI should call:

```text
GET http://127.0.0.1:17658/health
```

Use the result to show:

- `Printer Ready`
- `Label Printer Ready`
- `Silent Print Unavailable`

### Polling Recommendation

- check on POS screen mount
- re-check after failed print attempts
- optional light polling every 30 to 60 seconds while POS screen is open

Do not aggressively poll in the background across the whole app.

---

## Fallback Behavior

### If Agent Is Unavailable

Do not block the sale.

Instead:

1. complete the sale normally
2. show a message like `Silent printer unavailable`
3. offer:
   - `Retry silent print`
   - `Open browser print`
   - `Download receipt PDF` later if implemented

### If Receipt Print Fails

Keep sale status unchanged.

Printing is a post-sale workstation action, not part of inventory commit.

### If Label Print Fails

Show actionable UI:

- check local print agent
- check label printer connection
- retry label print

---

## Recommended UI States

### POS Header Status

Show a small device badge:

- `Printer Connected`
- `Printer Offline`
- `Label Printer Connected`
- `Scanner Ready`

### Checkout Result Modal

After sale completion, show:

- `Print Receipt`
- `Reprint Receipt`
- `Print Label` if relevant

### Settings Page

Store-level POS settings can later include:

- receipt auto-print on sale completion
- default receipt printer name
- default label printer name
- label size preset
- whether to show browser-print fallback automatically

---

## Scanner Integration Rule

Barcode scanners do not need localhost agent integration if they operate as:

- `USB HID keyboard mode`

Frontend requirements:

- maintain a focused POS search input
- accept fast keyboard-like input
- support `Enter` suffix behavior
- debounce only where it does not slow scanning

Do not require:

- browser extensions
- serial drivers
- vendor SDKs

---

## Security Rules

### CORS

The local print agent should only accept trusted app origins.

### No Direct Public Exposure

The print agent must stay on:

```text
127.0.0.1
```

It should never be exposed to the LAN or the public internet by default.

### Minimal Trust Boundary

The frontend should send only print jobs.
It should not send sensitive admin secrets to the local agent.

---

## Backend Responsibility Boundary

The backend should:

- return confirmed sale data
- return receipt-ready structured data if needed
- return label data for products
- store receipt and sale history

The backend should not:

- directly print to store hardware from the VPS
- assume printers are reachable from the server

---

## Recommended Implementation Contract

### Frontend Service

Create a dedicated client utility such as:

```text
lib/print-agent.ts
```

With methods:

- `checkPrintAgentHealth()`
- `printReceipt(payload)`
- `printLabel(payload)`

### Suggested TypeScript Types

```ts
type PrintAgentHealth = {
  ok: boolean;
  service: string;
  port: number;
  platform: string;
  printerName: string | null;
  labelPrinterName: string | null;
};

type ReceiptPrintPayload = {
  printerName?: string;
  text: string;
};

type LabelPrintPayload = {
  printerName?: string;
  text: string;
};
```

---

## Recommended Rollout

### Phase 1

- health check integration
- silent receipt printing
- browser-print fallback
- reprint receipt action
- basic label printing

### Phase 1.1

- printer status badges
- printer settings UI
- better formatted label templates

### Phase 2

- richer label layouts
- downloadable receipt archive
- optional hardware diagnostics screen

---

## Final Recommendation

The POS frontend should behave like this:

- try localhost print-agent first
- never block sale completion on print failure
- keep receipt printing local
- keep scanner support keyboard-based
- keep printers certified and standardized

That gives you a professional silent-print POS without coupling store hardware to the VPS.
