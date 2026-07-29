import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import fsSync from 'node:fs';

// Load .env file from agent directory (created by setup.bat / setup.sh)
try {
  const envPath = new URL('.env', import.meta.url).pathname;
  if (fsSync.existsSync(envPath)) {
    const content = fsSync.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
  }
} catch {}



const PORT = Number(process.env.MVP_PRINT_AGENT_PORT || 17668);
const PRINTER_NAME = process.env.MVP_PRINTER_NAME || '';
const LABEL_PRINTER_NAME = process.env.MVP_LABEL_PRINTER_NAME || '';
const API_BASE_URL = process.env.MVP_API_BASE_URL || 'https://api.merchflow.appbrainer.tech/v1';
const STORE_ID = process.env.MVP_STORE_ID || '';
const AUTH_TOKEN = process.env.MVP_AUTH_TOKEN || '';
const POLL_INTERVAL_MS = Number(process.env.MVP_POLL_INTERVAL_MS || 3000);
const ALLOWED_ORIGINS = new Set(
  (process.env.MVP_ALLOWED_ORIGINS
    || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,https://merchflow.appbrainer.tech,https://admin.merchflow.appbrainer.tech,https://app.merchflow.appbrainer.tech,https://store.merchflow.appbrainer.tech')
    .split(',').map((v) => v.trim()).filter(Boolean),
);

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const err = (msg) => console.error(`[${new Date().toISOString()}] ${msg}`);

const json = (res, statusCode, payload) => {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
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
    if (input) child.stdin.end(input); else child.stdin.end();
  });

const runCapture = (command, args, input = null) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [], stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString('utf8'));
      else reject(new Error(`${command} exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`));
    });
    if (input) child.stdin.end(input); else child.stdin.end();
  });

// ── Printing ──

const printWithCups = async (buffer, printerName) => {
  const target = printerName || PRINTER_NAME;
  const file = path.join(os.tmpdir(), `mvp-print-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
  await fs.writeFile(file, buffer);
  try { await run('/usr/bin/lp', target ? ['-d', target, '-o', 'raw', file] : ['-o', 'raw', file]); }
  finally { await fs.unlink(file).catch(() => {}); }
};

const printWithWindows = async (text, printerName) => {
  const target = printerName || PRINTER_NAME;
  const file = path.join(os.tmpdir(), `mvp-print-${Date.now()}.txt`);
  await fs.writeFile(file, text, 'utf8');
  const qf = file.replace(/'/g, "''");
  const cmd = target ? `Get-Content -LiteralPath '${qf}' | Out-Printer -Name '${target.replace(/'/g, "''")}'` : `Get-Content -LiteralPath '${qf}' | Out-Printer`;
  try { await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd]); }
  finally { await fs.unlink(file).catch(() => {}); }
};

async function printRawWin(bytes, printerName) {
  const file = path.join(os.tmpdir(), `mvp-print-${Date.now()}.bin`);
  await fs.writeFile(file, bytes);
  const qf = file.replace(/'/g, "''");
  const target = printerName || PRINTER_NAME;
  const psPn = target ? `'${target.replace(/'/g, "''")}'` : `((Get-CimInstance Win32_Printer | Where-Object {$_.Default -eq $true} | Select-Object -First 1 -ExpandProperty Name))`;
  const ps = `Add-Type -TypeDefinition @"
using System;using System.Runtime.InteropServices;
public static class R{public struct D{[MarshalAs(UnmanagedType.LPWStr)]public string a,b,c;}
[DllImport("winspool.Drv",EntryPoint="OpenPrinterW",SetLastError=true,CharSet=CharSet.Unicode)]static extern bool O(string p,out IntPtr h,IntPtr d);
[DllImport("winspool.Drv")]static extern bool C(IntPtr h);
[DllImport("winspool.Drv",EntryPoint="StartDocPrinterW",SetLastError=true,CharSet=CharSet.Unicode)]static extern bool S(IntPtr h,int l,[In]D d);
[DllImport("winspool.Drv")]static extern bool E(IntPtr h);
[DllImport("winspool.Drv")]static extern bool P(IntPtr h);
[DllImport("winspool.Drv")]static extern bool Ep(IntPtr h);
[DllImport("winspool.Drv")]static extern bool W(IntPtr h,IntPtr b,int c,out int w);
public static bool Send(string n,byte[] b){IntPtr h=IntPtr.Zero,p=IntPtr.Zero;var d=new D{a="MVP Print",c="RAW"};
try{if(!O(n,out h,IntPtr.Zero))return false;if(!S(h,1,d))return false;if(!P(h))return false;
p=System.Runtime.InteropServices.Marshal.AllocCoTaskMem(b.Length);System.Runtime.InteropServices.Marshal.Copy(b,0,p,b.Length);int w;var ok=W(h,p,b.Length,out w);Ep(h);E(h);return ok&&w==b.Length;}
finally{if(p!=IntPtr.Zero)System.Runtime.InteropServices.Marshal.FreeCoTaskMem(p);if(h!=IntPtr.Zero)C(h);}}}"@
$pn=${psPn};if([string]::IsNullOrWhiteSpace($pn)){throw"No printer"}$b=[System.IO.File]::ReadAllBytes('${qf}');if(-not[R]::Send($pn,$b)){throw"WritePrinter failed on $pn"}`;
  try { await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps]); }
  finally { await fs.unlink(file).catch(() => {}); }
}

// ── ESC/POS builder (receipt → raw bytes for silent printing) ──

const RECEIPT_COLUMNS = 32;
const ESC = 0x1b, GS = 0x1d;

function sanitize(v) { return (v || '').normalize('NFKD').replace(/[^\x20-\x7E\n]/g, '').replace(/\r/g, ''); }
function center(val, w = RECEIPT_COLUMNS) { const t = sanitize(val).slice(0, w); const l = Math.max(0, Math.floor((w - t.length) / 2)); return ' '.repeat(l) + t; }
function padL(l, r, w = RECEIPT_COLUMNS) { const a = sanitize(l), b = sanitize(r); const s = Math.max(1, w - a.length - b.length); return (a + ' '.repeat(s) + b).slice(0, w); }

function buildEscPosReceipt(receipt) {
  const enc = new TextEncoder();
  const chunks = [ESC, 0x40];
  const push = (val, align = 0) => { chunks.push(ESC, 0x61, align); chunks.push(...enc.encode(sanitize(val) + '\n')); };

  push(center(receipt.store?.name || 'Store'), 1);
  [receipt.store?.phone, receipt.store?.email, receipt.store?.address].filter(Boolean).forEach((line) => push(center(line), 1));
  push('-'.repeat(RECEIPT_COLUMNS));
  push(receipt.saleNo ? padL('Receipt', receipt.saleNo) : 'Receipt');
  push(`Printed: ${sanitize(receipt.printedAt ? new Date(receipt.printedAt).toLocaleString() : new Date().toLocaleString())}`);
  if (receipt.customer?.name) push(`Customer: ${receipt.customer.name}`);
  if (receipt.customer?.phone) push(`Phone: ${receipt.customer.phone}`);
  if (receipt.customer?.shopName) push(`Shop: ${receipt.customer.shopName}`);
  push('-'.repeat(RECEIPT_COLUMNS));

  for (const item of receipt.items || []) {
    push(sanitize(item.name || 'Item'));
    push(padL(`${Number(item.qty || 0)} x ${Number(item.unitPrice || 0).toFixed(2)}`, Number(item.lineTotal || 0).toFixed(2)));
    if (item.skuCode) push(`SKU: ${item.skuCode}`);
    if (Number(item.discountAmount) > 0) push(padL('  Discount', '-' + Number(item.discountAmount).toFixed(2)));
  }

  push('-'.repeat(RECEIPT_COLUMNS));
  push(padL('Subtotal', (receipt.totals?.subtotal || 0).toFixed(2)));
  if (Number(receipt.totals?.discount) > 0) push(padL('Discount', '-' + Number(receipt.totals.discount).toFixed(2)));
  push(padL('Total', (receipt.totals?.total || 0).toFixed(2)));
  push(padL('Paid', (receipt.totals?.paid || 0).toFixed(2)));
  if (Number(receipt.totals?.due || 0) > 0) push(padL('Due', (receipt.totals.due || 0).toFixed(2)));
  if (Number(receipt.totals?.change || 0) > 0) push(padL('Change', (receipt.totals.change || 0).toFixed(2)));

  if (receipt.payments?.length) {
    push('-'.repeat(RECEIPT_COLUMNS));
    for (const p of receipt.payments) {
      push(padL(`${p.paymentMethod || 'payment'}${p.status ? ` (${p.status})` : ''}`, Number(p.amount).toFixed(2)));
    }
  }
  if (receipt.store?.footer) { push('-'.repeat(RECEIPT_COLUMNS)); push(center(receipt.store.footer), 1); }

  chunks.push(0x0a, 0x0a, 0x0a, GS, 0x56, 0x41, 0x10);
  return new Uint8Array(chunks);
}

async function printReceiptLocally(receipt, printerName) {
  const bytes = buildEscPosReceipt(receipt);
  if (process.platform === 'win32') await printRawWin(bytes, printerName || PRINTER_NAME);
  else await printWithCups(bytes, printerName || PRINTER_NAME);
}

// ── API polling ──

async function apiFetch(endpoint) {
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  if (STORE_ID) headers['x-store-id'] = STORE_ID;
  const url = `${API_BASE_URL}${endpoint}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`API ${endpoint} returned ${res.status}`);
  return res.json();
}

async function pollAndPrint() {
  if (!STORE_ID || !AUTH_TOKEN) {
    log('Polling disabled — set MVP_STORE_ID and MVP_AUTH_TOKEN');
    return;
  }

  try {
    const { jobs } = await apiFetch('/pos/print-jobs/pending?limit=5');
    if (!jobs?.length) return;

    for (const job of jobs) {
      log(`Print job ${job.id} for sale ${job.sale_no}`);
      try {
        const { receipt } = await apiFetch(`/pos/print-jobs/${job.id}/receipt`);
        await printReceiptLocally(receipt, PRINTER_NAME);
        await apiFetch('/pos/print-jobs/' + job.id + '/complete');
        await fetch(`${API_BASE_URL}/pos/print-jobs/${job.id}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH_TOKEN}`, 'x-store-id': STORE_ID },
          body: JSON.stringify({ status: 'printed' }),
        });
        log(`✓ Printed sale ${job.sale_no}`);
      } catch (e) {
        err(`Failed job ${job.id}: ${e.message}`);
      }
    }
  } catch (e) {
    // Silent — API might be temporarily unreachable
  }
}

// ── Local HTTP server (backward-compatible) ──

const parseBody = async (req) => {
  const chunks = []; let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) { const e = new Error('Body too large'); e.statusCode = 413; throw e; }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const allowCors = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const server = http.createServer(async (req, res) => {
  allowCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, { ok: true, service: 'multivendor-print-agent', port: PORT, platform: process.platform, printerName: PRINTER_NAME || null, labelPrinterName: LABEL_PRINTER_NAME || null, polling: Boolean(STORE_ID && AUTH_TOKEN), apiBaseUrl: API_BASE_URL });
      return;
    }

    if (req.method === 'POST' && req.url === '/print/receipt') {
      const p = await parseBody(req);
      const text = typeof p.text === 'string' ? p.text : (Array.isArray(p.lines) ? p.lines.join('\n') : 'Receipt\n');
      if (process.platform === 'win32') await printWithWindows(text, p.printerName);
      else await printWithCups(Buffer.from(text, 'utf8'), p.printerName);
      json(res, 200, { ok: true }); return;
    }

    if (req.method === 'POST' && req.url === '/print/raw') {
      const p = await parseBody(req);
      const bytes = typeof p.base64 === 'string' ? Buffer.from(p.base64, 'base64') : Array.isArray(p.bytes) ? Buffer.from(p.bytes) : null;
      if (!bytes?.length) { json(res, 400, { ok: false, error: 'Empty' }); return; }
      if (process.platform === 'win32') await printRawWin(bytes, p.printerName || PRINTER_NAME);
      else await printWithCups(bytes, p.printerName || PRINTER_NAME);
      json(res, 200, { ok: true }); return;
    }

    if (req.method === 'POST' && req.url === '/print/label') {
      const p = await parseBody(req);
      const text = typeof p.text === 'string' ? p.text : (Array.isArray(p.lines) ? p.lines.join('\n') : 'Label\n');
      if (process.platform === 'win32') await printWithWindows(text, p.printerName || LABEL_PRINTER_NAME);
      else await printWithCups(Buffer.from(text, 'utf8'), p.printerName || LABEL_PRINTER_NAME);
      json(res, 200, { ok: true }); return;
    }

    if (req.method === 'POST' && req.url === '/hardware/drawer-open') {
      const p = await parseBody(req);
      const pin = p.pin === 5 ? 5 : 2;
      const db = pin === 5 ? [0x1b, 0x70, 0x01, 0x19, 0xfa] : [0x1b, 0x70, 0x00, 0x19, 0xfa];
      if (process.platform === 'win32') await printRawWin(Buffer.from(db), p.printerName || PRINTER_NAME);
      else await printWithCups(Buffer.from(db), p.printerName || PRINTER_NAME);
      json(res, 200, { ok: true, pin }); return;
    }

    json(res, 404, { ok: false, error: 'Not found' });
  } catch (e) {
    json(res, e.statusCode || 500, { ok: false, error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  log(`HTTP server on http://127.0.0.1:${PORT}`);
  log(`Printer: ${PRINTER_NAME || '(system default)'}`);
  if (STORE_ID && AUTH_TOKEN) {
    log(`Polling ${API_BASE_URL} every ${POLL_INTERVAL_MS}ms for store ${STORE_ID}`);
    setInterval(pollAndPrint, POLL_INTERVAL_MS);
    pollAndPrint(); // immediate first poll
  } else {
    log('Set MVP_STORE_ID + MVP_AUTH_TOKEN to enable auto-print polling');
  }
});
