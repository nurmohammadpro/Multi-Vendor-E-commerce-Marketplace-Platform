# Multi Vendor Print Agent

Local silent print bridge for the store POS.

This agent is meant to run on the **cashier or manager workstation**, not on the VPS.

It is used for:

- silent receipt printing
- local label printing
- startup-time local print availability after user login

## Why This Exists

Browsers and PWAs cannot reliably print silently on their own.

The correct production model is:

```text
Store Web POS -> http://127.0.0.1:17658 -> local print agent -> local printer
```

## Supported Operating Systems

- Windows
- macOS

## Requirements

- Node.js `18+`
- printer installed in the operating system
- receipt printer should be `ESC/POS-compatible`
- barcode scanners should be `USB HID` keyboard-mode devices

## Start Manually

```bash
cd print-agent
node server.js
```

Health check:

```text
http://127.0.0.1:17658/health
```

## API Endpoints

- `GET /health`
- `POST /print/receipt`
- `POST /print/label`

Example payload:

```json
{
  "text": "Test print\nThank you"
}
```

## Auto-Start on Windows

Open PowerShell in the `print-agent` directory and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-task.ps1
```

With named printers:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-task.ps1 -PrinterName "XP-Q80A" -LabelPrinterName "XP-420B"
```

Uninstall:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-windows-task.ps1
```

## Auto-Start on macOS

From the `print-agent` directory:

```bash
./scripts/install-macos-launchagent.sh
```

With printer names:

```bash
MVP_PRINTER_NAME="XP-Q80A" MVP_LABEL_PRINTER_NAME="XP-420B" ./scripts/install-macos-launchagent.sh
```

Uninstall:

```bash
./scripts/uninstall-macos-launchagent.sh
```

## Important Production Note

The VPS does not replace this agent.

Your final POS model is:

- platform hosted on `Hostinger VPS`
- local silent print agent on each cashier/manager computer
- local receipt and label printers installed on that computer

That is how you get professional silent printing.
