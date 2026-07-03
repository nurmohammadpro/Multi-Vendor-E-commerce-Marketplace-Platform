# Multi Vendor Print Agent — Silent Receipt Printing

Local silent print bridge for the store POS. Runs on **cashier/manager workstations**, not the VPS.

## Quick Setup (XP-Q80A / any ESC/POS thermal printer)

### Step 1 — Install printer driver
- Download XP-Q80A driver from `https://ihp.com.bd` or the Xprinter CD
- Windows: Install driver, name the printer `XP-Q80A`
- macOS: Add via System Settings → Printers, name it `XP-Q80A`

### Step 2 — Start the print agent
```bash
cd print-agent
node server.js
```

### Step 3 — Verify
Open `https://127.0.0.1:17669/health` in your browser:
- Accept the self-signed certificate warning (click "Advanced" → "Proceed")
- You should see `{ "ok": true, "printerName": "XP-Q80A", ... }`

### Step 4 — Configure in Market One
1. Open Market One POS
2. Go to Hardware settings
3. Set receipt printer name to `XP-Q80A`
4. Save — the POS will auto-detect your printer

## How Silent Printing Works

```
POS sale completed
  → buildEscPosReceipt() formats ESC/POS binary in browser
  → POST https://127.0.0.1:17669/print/raw (base64)
  → Print agent writes raw bytes to Windows/macOS printer driver
  → XP-Q80A prints silently — no browser print dialog
```

The HTTPS port (17669) uses a self-signed certificate auto-generated on first launch. The HTTP port (17668) is still available for localhost dev use.

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Printer health + status |
| `/printers` | GET | List installed printers |
| `/print/receipt` | POST | Print plain-text receipt |
| `/print/raw` | POST | Print raw ESC/POS binary (recommended) |
| `/print/label` | POST | Print label |
| `/hardware/drawer-open` | POST | Kick cash drawer |

## Auto-Start

### Windows
```powershell
cd print-agent
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-task.ps1 -PrinterName "XP-Q80A"
```

### macOS
```bash
cd print-agent
MVP_PRINTER_NAME="XP-Q80A" ./scripts/install-macos-launchagent.sh
```
