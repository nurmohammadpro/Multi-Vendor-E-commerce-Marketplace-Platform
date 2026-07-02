import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.MVP_PRINT_AGENT_PORT || 17668);
const PRINTER_NAME = process.env.MVP_PRINTER_NAME || '';
const LABEL_PRINTER_NAME = process.env.MVP_LABEL_PRINTER_NAME || '';
const ALLOWED_ORIGINS = new Set(
  (
    process.env.MVP_ALLOWED_ORIGINS
    || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,https://marketone.appbrainer.tech,https://admin.marketone.appbrainer.tech,https://app.marketone.appbrainer.tech,https://store.marketone.appbrainer.tech'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const MAX_BODY_BYTES = 512 * 1024;

const json = (res, statusCode, payload) => {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
};

const run = (command, args, input = null) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });

const runCapture = (command, args, input = null) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString('utf8'));
      else reject(new Error(`${command} exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });

const printWithCups = async (buffer, printerName) => {
  const target = printerName || PRINTER_NAME;
  const file = path.join(os.tmpdir(), `mvp-print-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
  await fs.writeFile(file, buffer);
  try {
    const args = [];
    if (target) args.push('-d', target);
    args.push('-o', 'raw', file);
    await run('/usr/bin/lp', args, null);
  } finally {
    await fs.unlink(file).catch(() => {});
  }
};

const printWithWindows = async (text, printerName) => {
  const target = printerName || PRINTER_NAME;
  const file = path.join(os.tmpdir(), `mvp-print-${Date.now()}.txt`);
  await fs.writeFile(file, text, 'utf8');
  const quotedFile = file.replaceAll("'", "''");
  const psCommand = target
    ? `Get-Content -LiteralPath '${quotedFile}' | Out-Printer -Name '${target.replaceAll("'", "''")}'`
    : `Get-Content -LiteralPath '${quotedFile}' | Out-Printer`;
  try {
    await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], null);
  } finally {
    await fs.unlink(file).catch(() => {});
  }
};

const RAW_PRINTER_HELPER_PS = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    private class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);

    [DllImport("winspool.Drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes)
    {
        IntPtr hPrinter = IntPtr.Zero;
        IntPtr pUnmanagedBytes = IntPtr.Zero;
        var docInfo = new DOCINFO
        {
            pDocName = "Multi Vendor Print Job",
            pDataType = "RAW"
        };

        try
        {
            if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            {
                return false;
            }

            if (!StartDocPrinter(hPrinter, 1, docInfo))
            {
                return false;
            }

            if (!StartPagePrinter(hPrinter))
            {
                return false;
            }

            pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);

            int written;
            var ok = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written);
            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);

            return ok && written == bytes.Length;
        }
        finally
        {
            if (pUnmanagedBytes != IntPtr.Zero)
            {
                Marshal.FreeCoTaskMem(pUnmanagedBytes);
            }

            if (hPrinter != IntPtr.Zero)
            {
                ClosePrinter(hPrinter);
            }
        }
    }
}
"@
`;

const normalizeReceiptText = (payload) => {
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text;
  if (Array.isArray(payload.lines)) return payload.lines.join('\n');
  return 'Receipt\n';
};

const printReceipt = async (payload) => {
  const text = normalizeReceiptText(payload);
  if (process.platform === 'win32') {
    await printWithWindows(text, payload.printerName);
    return;
  }
  await printWithCups(Buffer.from(text, 'utf8'), payload.printerName);
};

const printRawBytes = async (bytes, printerName) => {
  if (process.platform === 'win32') {
    const file = path.join(os.tmpdir(), `mvp-print-${Date.now()}.bin`);
    await fs.writeFile(file, bytes);
    const target = printerName || PRINTER_NAME;
    const quotedFile = file.replaceAll("'", "''");
    const selectedPrinter = target ? `'${target.replaceAll("'", "''")}'` : `((Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name))`;
    const psCommand = `
${RAW_PRINTER_HELPER_PS}
$printerName = ${selectedPrinter}
if ([string]::IsNullOrWhiteSpace($printerName)) { throw "No Windows printer selected or default printer configured." }
$bytes = [System.IO.File]::ReadAllBytes('${quotedFile}')
if (-not [RawPrinterHelper]::SendBytesToPrinter($printerName, $bytes)) {
  throw "Failed to send raw bytes to printer: $printerName"
}
`;
    try {
      await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], null);
    } finally {
      await fs.unlink(file).catch(() => {});
    }
    return;
  }
  await printWithCups(bytes, printerName || PRINTER_NAME);
};

const printLabel = async (payload) => {
  const text = normalizeReceiptText(payload);
  if (process.platform === 'win32') {
    await printWithWindows(text, payload.printerName || LABEL_PRINTER_NAME);
    return;
  }
  await printWithCups(Buffer.from(text, 'utf8'), payload.printerName || LABEL_PRINTER_NAME);
};

const listPrinters = async () => {
  if (process.platform === 'win32') {
    const output = await runCapture(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "Get-CimInstance Win32_Printer | Select-Object Name,Default,DriverName,PortName | ConvertTo-Json -Compress",
      ],
      null,
    );
    const parsed = JSON.parse(output || '[]');
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .filter((row) => row?.Name)
      .map((row) => ({
        name: String(row.Name),
        isDefault: Boolean(row.Default),
        driverName: row.DriverName ? String(row.DriverName) : null,
        portName: row.PortName ? String(row.PortName) : null,
      }));
  }

  const output = await runCapture('/usr/bin/lpstat', ['-p'], null);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('printer '))
    .map((line) => {
      const match = line.match(/^printer\s+(\S+)/);
      return match?.[1]
        ? {
            name: match[1],
            isDefault: false,
            driverName: null,
            portName: null,
          }
        : null;
    })
    .filter(Boolean);
};

const parseBody = async (req) => {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const allowCors = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
};

const server = http.createServer(async (req, res) => {
  allowCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, {
      ok: true,
      service: 'multivendor-print-agent',
      port: PORT,
      platform: process.platform,
      printerName: PRINTER_NAME || null,
      labelPrinterName: LABEL_PRINTER_NAME || null,
      features: {
        receiptPrinting: true,
        labelPrinting: true,
        cashDrawer: true,
        barcodePrinting: true,
        rawPrinting: true,
        logoPrinting: true,
      },
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/printers') {
    try {
      const printers = await listPrinters();
      json(res, 200, {
        ok: true,
        printers,
        defaults: {
          receiptPrinterName: PRINTER_NAME || null,
          labelPrinterName: LABEL_PRINTER_NAME || null,
        },
      });
    } catch (error) {
      json(res, error.statusCode || 500, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/print/receipt') {
    try {
      const payload = await parseBody(req);
      await printReceipt(payload);
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, error.statusCode || 500, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/print/label') {
    try {
      const payload = await parseBody(req);
      await printLabel(payload);
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, error.statusCode || 500, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/print/raw') {
    try {
      const payload = await parseBody(req);
      const bytes =
        typeof payload.base64 === 'string' && payload.base64
          ? Buffer.from(payload.base64, 'base64')
          : Array.isArray(payload.bytes)
            ? Buffer.from(payload.bytes)
            : null;
      if (!bytes?.length) {
        throw new Error('Raw print payload is empty');
      }
      await printRawBytes(bytes, payload.printerName);
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, error.statusCode || 500, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/hardware/drawer-open') {
    try {
      const payload = await parseBody(req);
      const pin = payload.pin === 5 ? 5 : 2;
      const printerName = payload.printerName || PRINTER_NAME;
      const drawerBytes = pin === 5
        ? Buffer.from([0x1b, 0x70, 0x01, 0x19, 0xfa])
        : Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
      await printRawBytes(drawerBytes, printerName);
      json(res, 200, { ok: true, pin, printerName: printerName || null });
    } catch (error) {
      json(res, error.statusCode || 500, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  json(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Multi Vendor print agent listening on http://127.0.0.1:${PORT}`);
});
