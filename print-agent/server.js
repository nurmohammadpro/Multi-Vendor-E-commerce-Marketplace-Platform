import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

const PORT = Number(process.env.MVP_PRINT_AGENT_PORT || 17668);
const TLS_PORT = Number(process.env.MVP_PRINT_AGENT_TLS_PORT || 17669);
const PRINTER_NAME = process.env.MVP_PRINTER_NAME || '';
const LABEL_PRINTER_NAME = process.env.MVP_LABEL_PRINTER_NAME || '';
const CERT_DIR = process.env.MVP_PRINT_AGENT_CERT_DIR || path.join(os.homedir(), '.mvp-print-agent');
const ALLOWED_ORIGINS = new Set(
  (process.env.MVP_ALLOWED_ORIGINS
    || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,https://marketone.appbrainer.tech,https://admin.marketone.appbrainer.tech,https://app.marketone.appbrainer.tech,https://store.marketone.appbrainer.tech')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
);
const MAX_BODY_BYTES = 512 * 1024;

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
    if (input) child.stdin.end(input);
    else child.stdin.end();
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
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });

async function ensureCertFiles() {
  const keyFile = path.join(CERT_DIR, 'agent-key.pem');
  const certFile = path.join(CERT_DIR, 'agent-cert.pem');
  try {
    const [keyOk, certOk] = await Promise.all([
      fs.access(keyFile).then(() => true, () => false),
      fs.access(certFile).then(() => true, () => false),
    ]);
    if (keyOk && certOk) return { key: await fs.readFile(keyFile), cert: await fs.readFile(certFile) };
  } catch {}

  await fs.mkdir(CERT_DIR, { recursive: true }).catch(() => {});

  if (process.platform === 'win32') {
    const pfxFile = path.join(CERT_DIR, 'agent.pfx');
    const ps = `$cert=New-SelfSignedCertificate -DnsName 'localhost','127.0.0.1' -CertStoreLocation 'Cert:\\CurrentUser\\My' -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(5);$pwd=ConvertTo-SecureString -String 'mvp-agent' -Force -AsPlainText;Export-PfxCertificate -Cert $cert -FilePath '${pfxFile}' -Password $pwd`;
    try { execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, { stdio: 'ignore', timeout: 30000 }); } catch {}
    return { pfx: pfxFile, passphrase: 'mvp-agent' };
  }

  try {
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyFile}" -out "${certFile}" -days 1825 -nodes -subj "/CN=localhost/O=MarketOne BD Print Agent"`, { stdio: 'ignore', timeout: 15000 });
  } catch {}
  return { key: await fs.readFile(keyFile), cert: await fs.readFile(certFile) };
}

// ── Printing helpers ──

const printWithCups = async (buffer, printerName) => {
  const target = printerName || PRINTER_NAME;
  const file = path.join(os.tmpdir(), `mvp-print-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
  await fs.writeFile(file, buffer);
  try {
    const args = target ? ['-d', target, '-o', 'raw', file] : ['-o', 'raw', file];
    await run('/usr/bin/lp', args);
  } finally { await fs.unlink(file).catch(() => {}); }
};

const printWithWindows = async (text, printerName) => {
  const target = printerName || PRINTER_NAME;
  const file = path.join(os.tmpdir(), `mvp-print-${Date.now()}.txt`);
  await fs.writeFile(file, text, 'utf8');
  const qf = file.replace(/'/g, "''");
  const cmd = target
    ? `Get-Content -LiteralPath '${qf}' | Out-Printer -Name '${target.replace(/'/g, "''")}'`
    : `Get-Content -LiteralPath '${qf}' | Out-Printer`;
  try { await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd]); }
  finally { await fs.unlink(file).catch(() => {}); }
};

const normalizeText = (p) => {
  if (typeof p.text === 'string' && p.text.trim()) return p.text;
  if (Array.isArray(p.lines)) return p.lines.join('\n');
  return 'Receipt\n';
};

// ── Request handling ──

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
};

const createApp = () => {
  return async (req, res) => {
    allowCors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try { await route(req, res); }
    catch (e) { json(res, e.statusCode || 500, { ok: false, error: String(e.message || e) }); }
  };
};

async function route(req, res) {
  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true, service: 'multivendor-print-agent', port: PORT, tlsPort: TLS_PORT, platform: process.platform, printerName: PRINTER_NAME || null, labelPrinterName: LABEL_PRINTER_NAME || null, features: { receiptPrinting: true, labelPrinting: true, cashDrawer: true, barcodePrinting: true, rawPrinting: true, logoPrinting: true } });
    return;
  }
  if (req.method === 'GET' && req.url === '/printers') {
    const printers = await listPrinters();
    json(res, 200, { ok: true, printers, defaults: { receiptPrinterName: PRINTER_NAME || null, labelPrinterName: LABEL_PRINTER_NAME || null } });
    return;
  }
  if (req.method === 'POST' && req.url === '/print/receipt') {
    const p = await parseBody(req);
    const text = normalizeText(p);
    if (process.platform === 'win32') await printWithWindows(text, p.printerName);
    else await printWithCups(Buffer.from(text, 'utf8'), p.printerName);
    json(res, 200, { ok: true }); return;
  }
  if (req.method === 'POST' && req.url === '/print/label') {
    const p = await parseBody(req);
    const text = normalizeText(p);
    if (process.platform === 'win32') await printWithWindows(text, p.printerName || LABEL_PRINTER_NAME);
    else await printWithCups(Buffer.from(text, 'utf8'), p.printerName || LABEL_PRINTER_NAME);
    json(res, 200, { ok: true }); return;
  }
  if (req.method === 'POST' && req.url === '/print/raw') {
    const p = await parseBody(req);
    const bytes = typeof p.base64 === 'string' ? Buffer.from(p.base64, 'base64') : Array.isArray(p.bytes) ? Buffer.from(p.bytes) : null;
    if (!bytes?.length) throw Object.assign(new Error('Empty'), { statusCode: 400 });
    if (process.platform === 'win32') {
      await printRawWin(bytes, p.printerName || PRINTER_NAME);
    } else {
      await printWithCups(bytes, p.printerName || PRINTER_NAME);
    }
    json(res, 200, { ok: true }); return;
  }
  if (req.method === 'POST' && req.url === '/hardware/drawer-open') {
    const p = await parseBody(req);
    const pin = p.pin === 5 ? 5 : 2;
    const dpin = pin === 5 ? [0x1b, 0x70, 0x01, 0x19, 0xfa] : [0x1b, 0x70, 0x00, 0x19, 0xfa];
    if (process.platform === 'win32') await printRawWin(Buffer.from(dpin), p.printerName || PRINTER_NAME);
    else await printWithCups(Buffer.from(dpin), p.printerName || PRINTER_NAME);
    json(res, 200, { ok: true, pin, printerName: p.printerName || PRINTER_NAME || null });
    return;
  }
  json(res, 404, { ok: false, error: 'Not found' });
}

async function printRawWin(bytes, printerName) {
  const file = path.join(os.tmpdir(), `mvp-print-${Date.now()}.bin`);
  await fs.writeFile(file, bytes);
  const qf = file.replace(/'/g, "''");
  const target = printerName || PRINTER_NAME;
  const psPrinterName = target ? `'${target.replace(/'/g, "''")}'` : `((Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name))`;
  const ps = `
Add-Type -TypeDefinition @"
using System;using System.Runtime.InteropServices;
public static class RawPrinterHelper {
[DllImport("winspool.Drv",EntryPoint="OpenPrinterW",SetLastError=true,CharSet=CharSet.Unicode)]
static extern bool OpenPrinter(string p,out IntPtr h,IntPtr d);
[DllImport("winspool.Drv",SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
[DllImport("winspool.Drv",EntryPoint="StartDocPrinterW",SetLastError=true,CharSet=CharSet.Unicode)]
static extern bool StartDocPrinter(IntPtr h,int l,[In]DOCINFO d);
[DllImport("winspool.Drv")] static extern bool EndDocPrinter(IntPtr h);
[DllImport("winspool.Drv")] static extern bool StartPagePrinter(IntPtr h);
[DllImport("winspool.Drv")] static extern bool EndPagePrinter(IntPtr h);
[DllImport("winspool.Drv")] static extern bool WritePrinter(IntPtr h,IntPtr b,int c,out int w);
class DOCINFO {[MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
[MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;[MarshalAs(UnmanagedType.LPWStr)] public string pDataType;}
public static bool Send(string n,byte[] b){IntPtr h=IntPtr.Zero,p=IntPtr.Zero;var d=new DOCINFO{pDocName="MVP Print",pDataType="RAW"};
try{if(!OpenPrinter(n,out h,IntPtr.Zero))return false;if(!StartDocPrinter(h,1,d))return false;if(!StartPagePrinter(h))return false;
p=Marshal.AllocCoTaskMem(b.Length);Marshal.Copy(b,0,p,b.Length);int w;var ok=WritePrinter(h,p,b.Length,out w);EndPagePrinter(h);EndDocPrinter(h);return ok&&w==b.Length;}
finally{if(p!=IntPtr.Zero)Marshal.FreeCoTaskMem(p);if(h!=IntPtr.Zero)ClosePrinter(h);}}
}
"@
$pn=${psPrinterName}; if([string]::IsNullOrWhiteSpace($pn)){throw"No printer"}
$b=[System.IO.File]::ReadAllBytes('${qf}'); if(-not[RawPrinterHelper]::Send($pn,$b)){throw"WritePrinter failed on $pn"}`;
  try { await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps]); }
  finally { await fs.unlink(file).catch(() => {}); }
}

async function listPrinters() {
  if (process.platform === 'win32') {
    const out = await runCapture('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "Get-CimInstance Win32_Printer | Select-Object Name,Default,DriverName,PortName | ConvertTo-Json -Compress"]);
    const parsed = JSON.parse(out || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(r => r?.Name).map(r => ({ name: String(r.Name), isDefault: Boolean(r.Default), driverName: r.DriverName ? String(r.DriverName) : null, portName: r.PortName ? String(r.PortName) : null }));
  }
  const out = await runCapture('/usr/bin/lpstat', ['-p']);
  return out.split('\n').map(l => l.trim()).filter(l => l.startsWith('printer ')).map(l => { const m = l.match(/^printer\s+(\S+)/); return m?.[1] ? { name: m[1], isDefault: false, driverName: null, portName: null } : null; }).filter(Boolean);
}

// ── Start servers ──

const handler = createApp();

function startHttp() {
  const s = http.createServer(handler);
  s.listen(PORT, '127.0.0.1', () => console.log(`Print agent HTTP on http://127.0.0.1:${PORT}`));
  return s;
}

async function startHttps() {
  try {
    const { key, cert } = await ensureCertFiles();
    if (!key || !cert) { console.log('HTTPS skipped — no certificate available'); return; }
    const s = https.createServer({ key, cert }, handler);
    s.listen(TLS_PORT, '127.0.0.1', () => console.log(`Print agent HTTPS on https://127.0.0.1:${TLS_PORT}`));
    return s;
  } catch (e) { console.log('HTTPS skipped — cert setup failed:', e.message); }
}

startHttp();
startHttps();
