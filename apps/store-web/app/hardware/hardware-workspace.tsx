'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { fieldStyle } from '../marketone-theme';
import { useCompactLayout, WorkspaceTabs } from '../workspace-responsive';
import { fetchPrintAgentHealth, fetchPrintAgentPrinters, openCashDrawer, printLabel, printProductLabel, printReceipt, type PrintAgentHealth, type PrintAgentPrinter } from '../../lib/print-agent';
import { loadWorkstationProfile, saveWorkstationProfile } from '../../lib/workstation-profile';

type CatalogItem = {
  tier: string;
  model?: string;
  name?: string;
  useCase?: string;
  connectivity?: string;
  priceBdt: string;
  recommended: boolean;
};

type HardwareProfilePayload = {
  profile?: {
    bundlePreset?: string | null;
    printerMode?: "pos_thermal" | "laser_a5";
    receiptPrinterModel?: string | null;
    labelPrinterModel?: string | null;
    barcodeScannerModel?: string | null;
    cashDrawerModel?: string | null;
    silentPrintingEnabled?: boolean;
    printAgentAutostart?: 'windows_task' | 'mac_launchagent' | 'manual';
    notes?: string | null;
  };
  catalog?: {
    receiptPrinters?: CatalogItem[];
    labelPrinters?: CatalogItem[];
    barcodeScanners?: CatalogItem[];
    bundles?: CatalogItem[];
  };
  autostart?: {
    windowsScript?: string;
    macScript?: string;
  };
};

type StandardBundle = {
  id: 'pos-counter' | 'laser-counter';
  name: string;
  description: string;
  receiptPrinterModel: string | null;
  labelPrinterModel: string;
  barcodeScannerModel: string;
  cashDrawerModel: string | null;
  silentPrintingEnabled: boolean;
  recommendedFor: string;
};

const standardBundles: StandardBundle[] = [
  {
    id: 'pos-counter',
    name: 'POS Counter Setup',
    description: 'POS printer, label printer, barcode scanner, and cash drawer for fast cashier counters.',
    receiptPrinterModel: 'Xprinter XP-Q80A',
    labelPrinterModel: 'Xprinter XP-420B',
    barcodeScannerModel: 'Zebra DS2208',
    cashDrawerModel: 'Standard RJ11 cash drawer (ESC/POS trigger)',
    silentPrintingEnabled: true,
    recommendedFor: 'Most retail stores with frequent walk-in sales',
  },
  {
    id: 'laser-counter',
    name: 'Laser Counter Setup',
    description: 'Laser printer, label printer, and barcode scanner for stores that print on A4 instead of POS rolls.',
    receiptPrinterModel: 'HP LaserJet Pro / Canon imageCLASS (A4)',
    labelPrinterModel: 'Xprinter XP-420B',
    barcodeScannerModel: 'Zebra DS2208',
    cashDrawerModel: null,
    silentPrintingEnabled: false,
    recommendedFor: 'Low-volume counters and office-style billing desks',
  },
];

const windowsSteps = [
  'Install the receipt printer driver in Windows.',
  'Confirm the printer works from the OS test page.',
  'Run the local print agent from the `print-agent` folder.',
  'Run the Windows auto-start script once.',
  'Restart the PC and test receipt, label, and drawer actions.',
];

const macSteps = [
  'Add the printer in System Settings.',
  'Confirm the printer works from the OS test page.',
  'Run the local print agent from the `print-agent` folder.',
  'Install the LaunchAgent for auto-start on login.',
  'Restart the Mac and test receipt, label, and drawer actions.',
];

const hardwareNotes = [
  'Keep the store on one standard workstation type: POS Counter Setup or Laser Counter Setup.',
  'Use ESC/POS-compatible receipt printers only for the POS Counter Setup.',
  'Use USB HID barcode scanners so the POS receives scans in the focused field.',
  'Keep the print agent on the cashier workstation, not on the VPS.',
  'Save both the selected setup and the local printer names for consistent counter behavior.',
];

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  return payload as T;
}

export function HardwareWorkspace({ canManageSettings }: { canManageSettings: boolean }) {
  const compact = useCompactLayout();
  const [printHealth, setPrintHealth] = useState<PrintAgentHealth | null>(null);
  const [availablePrinters, setAvailablePrinters] = useState<PrintAgentPrinter[]>([]);
  const [printError, setPrintError] = useState<string | null>(null);
  const [receiptPrinterName, setReceiptPrinterName] = useState('');
  const [labelPrinterName, setLabelPrinterName] = useState('');
  const [agentUrl, setAgentUrl] = useState('http://127.0.0.1:17668');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('Save workstation names and store hardware presets together.');
  const [remoteProfile, setRemoteProfile] = useState<HardwareProfilePayload['profile']>({});
  const [catalog, setCatalog] = useState<HardwareProfilePayload['catalog']>({});
  const [autostart, setAutostart] = useState<HardwareProfilePayload['autostart']>({});
  const [activeTab, setActiveTab] = useState<'profile' | 'status' | 'guides'>('profile');

  const effectiveAgentUrl = useMemo(() => agentUrl.trim() || 'http://127.0.0.1:17668', [agentUrl]);

  const refreshRemoteProfile = async () => {
    const payload = await readJson<HardwareProfilePayload>('/api/store-ops/hardware/profile');
    setRemoteProfile(payload.profile ?? {});
    setCatalog(payload.catalog ?? {});
    setAutostart(payload.autostart ?? {});
  };

  useEffect(() => {
    const profile = loadWorkstationProfile();
    setReceiptPrinterName(profile.receiptPrinterName);
    setLabelPrinterName(profile.labelPrinterName);
    setAgentUrl(profile.agentUrl);
    void refreshRemoteProfile().catch((error: Error) => setMessage(error.message));
  }, []);

  const refreshHealth = async (baseUrl = effectiveAgentUrl) => {
    try {
      const health = await fetchPrintAgentHealth(baseUrl);
      setPrintHealth(health);
      setPrintError(null);
      return health;
    } catch (error) {
      setPrintHealth(null);
      setPrintError((error as Error).message);
      return null;
    }
  };

  const refreshPrinters = async (baseUrl = effectiveAgentUrl) => {
    try {
      const payload = await fetchPrintAgentPrinters(baseUrl);
      setAvailablePrinters(payload.printers ?? []);
      return payload;
    } catch (error) {
      setAvailablePrinters([]);
      throw error;
    }
  };

  useEffect(() => {
    void refreshHealth();
    void refreshPrinters().catch(() => {});
    const timer = window.setInterval(() => {
      void refreshHealth();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [effectiveAgentUrl]);

  const saveProfiles = async () => {
    if (!canManageSettings) {
      setMessage('Only owners and managers can save workstation settings.');
      return;
    }

    setSaving(true);
    try {
      saveWorkstationProfile({
        receiptPrinterName,
        labelPrinterName,
        agentUrl: effectiveAgentUrl,
      });
      await readJson('/api/store-ops/hardware/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(remoteProfile),
      });
      setMessage('Workstation names and store hardware profile saved.');
      await Promise.all([refreshHealth(effectiveAgentUrl), refreshPrinters(effectiveAgentUrl).catch(() => null), refreshRemoteProfile()]);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const applyBundle = (bundleId: string) => {
    const bundle = standardBundles.find((item) => item.id === bundleId);
    if (!bundle) return;
    setRemoteProfile((current) => ({
      ...current,
      bundlePreset: bundle.name,
      receiptPrinterModel: bundle.receiptPrinterModel,
      labelPrinterModel: bundle.labelPrinterModel,
      barcodeScannerModel: bundle.barcodeScannerModel,
      cashDrawerModel: bundle.cashDrawerModel,
      silentPrintingEnabled: bundle.silentPrintingEnabled,
    }));
  };

  const testReceipt = async () => {
    try {
      await printReceipt({
        saleNo: 'HW-TEST',
        store: { name: 'Hardware Test', footer: 'Workstation print check' },
        items: [{ name: 'Receipt test', skuCode: 'HW-TEST', qty: 1, unitPrice: 0, lineTotal: 0 }],
        totals: { subtotal: 0, discount: 0, tax: 0, shipping: 0, total: 0, paid: 0, change: 0 },
        printedAt: new Date().toISOString(),
      }, receiptPrinterName || undefined, effectiveAgentUrl);
      setMessage('Receipt test sent successfully.');
    } catch (error) {
      setMessage(`Receipt test failed: ${(error as Error).message}`);
    }
  };

  const testLabel = async () => {
    try {
      await printProductLabel({
        sku: 'HW-TEST-001',
        productName: 'Hardware Test Product',
        storeName: 'Test Store',
        sellingPrice: 100,
        printerName: labelPrinterName || undefined,
        widthMm: 40,
        heightMm: 25,
        barcodeType: '128',
        copies: 1,
        border: true,
      }, effectiveAgentUrl);
      setMessage('Label test sent successfully via TSPL.');
    } catch (error) {
      setMessage(`Label test failed: ${(error as Error).message}`);
    }
  };

  const testDrawer = async () => {
    try {
      await openCashDrawer({ printerName: receiptPrinterName || undefined }, effectiveAgentUrl);
      setMessage('Cash drawer command sent successfully.');
    } catch (error) {
      setMessage(`Cash drawer test failed: ${(error as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {compact ? (
        <WorkspaceTabs
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'profile' | 'status' | 'guides')}
          tabs={[
            { key: 'profile', label: 'Profiles' },
            { key: 'status', label: 'Status' },
            { key: 'guides', label: 'Guides' },
          ]}
        />
      ) : null}
      {(!compact || activeTab === 'profile') ? (
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Store hardware profile</CardTitle>
            <CardDescription>Choose one standard hardware setup for this store, then save the workstation details below.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3">
              {standardBundles.map((bundle) => {
                const active = (remoteProfile?.bundlePreset || '') === bundle.name;
                return (
                  <button
                    key={bundle.id}
                    type="button"
                    onClick={() => applyBundle(bundle.id)}
                    className={`rounded-xl border p-4 text-left transition-colors ${active ? 'border-foreground bg-muted' : 'border-border bg-background hover:bg-muted/60'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-foreground">{bundle.name}</div>
                      <Badge variant={active ? 'secondary' : 'outline'}>{active ? 'Selected' : 'Standard'}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{bundle.description}</div>
                    <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                      <div>Receipt / invoice printer: {bundle.receiptPrinterModel || 'A4 laser printer via browser print'}</div>
                      <div>Label printer: {bundle.labelPrinterModel}</div>
                      <div>Barcode scanner: {bundle.barcodeScannerModel}</div>
                      {bundle.cashDrawerModel ? <div>Cash drawer: {bundle.cashDrawerModel}</div> : null}
                      <div>Best for: {bundle.recommendedFor}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select value={remoteProfile?.printAgentAutostart || 'manual'} onChange={(event) => setRemoteProfile((current) => ({ ...current, printAgentAutostart: event.target.value as 'windows_task' | 'mac_launchagent' | 'manual' }))} style={fieldStyle}>
                <option value="windows_task">Windows Task Scheduler</option>
                <option value="mac_launchagent">macOS LaunchAgent</option>
                <option value="manual">Manual start</option>
              </select>
              <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Printer Mode</div>
              <select 
                value={remoteProfile?.printerMode || 'pos_thermal'} 
                onChange={(event) => setRemoteProfile((current) => ({ ...current, printerMode: event.target.value as 'pos_thermal' | 'laser_a5' }))} 
                style={fieldStyle}
              >
                <option value="pos_thermal">POS Thermal Printer (80mm receipt)</option>
                <option value="laser_a5">Laser Printer (A5 paper)</option>
              </select>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                POS mode prints ESC/POS to thermal. Laser mode prints A5 invoice PDF through browser.
              </div>
            </div>
            <input value={remoteProfile?.receiptPrinterModel || ''} onChange={(event) => setRemoteProfile((current) => ({ ...current, receiptPrinterModel: event.target.value }))} style={fieldStyle} placeholder="Receipt printer model" />
              <input value={remoteProfile?.labelPrinterModel || ''} onChange={(event) => setRemoteProfile((current) => ({ ...current, labelPrinterModel: event.target.value }))} style={fieldStyle} placeholder="Label printer model" />
              <input value={remoteProfile?.barcodeScannerModel || ''} onChange={(event) => setRemoteProfile((current) => ({ ...current, barcodeScannerModel: event.target.value }))} style={fieldStyle} placeholder="Barcode scanner model" />
              <input value={remoteProfile?.cashDrawerModel || ''} onChange={(event) => setRemoteProfile((current) => ({ ...current, cashDrawerModel: event.target.value }))} style={fieldStyle} placeholder="Cash drawer model" />
            </div>
            <textarea value={remoteProfile?.notes || ''} onChange={(event) => setRemoteProfile((current) => ({ ...current, notes: event.target.value }))} style={{ ...fieldStyle, minHeight: 88 }} placeholder="Hardware notes, driver quirks, or installer notes" />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={Boolean(remoteProfile?.silentPrintingEnabled)} onChange={(event) => setRemoteProfile((current) => ({ ...current, silentPrintingEnabled: event.target.checked }))} />
              Silent receipt printing enabled
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workstation printer profile</CardTitle>
            <CardDescription>Save the local printer names used by POS and receipt tests on this device.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Print agent URL</label>
              <input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} style={fieldStyle} placeholder="http://127.0.0.1:17668" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Receipt printer name</label>
              <input value={receiptPrinterName} onChange={(event) => setReceiptPrinterName(event.target.value)} style={fieldStyle} placeholder="XP-Q80A" />
              {availablePrinters.length ? (
                <select value={receiptPrinterName} onChange={(event) => setReceiptPrinterName(event.target.value)} style={fieldStyle}>
                  <option value="">Select installed receipt printer</option>
                  {availablePrinters.map((printer) => (
                    <option key={`receipt-${printer.name}`} value={printer.name}>
                      {printer.name}{printer.isDefault ? ' · Default' : ''}{printer.driverName ? ` · ${printer.driverName}` : ''}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Label printer name</label>
              <input value={labelPrinterName} onChange={(event) => setLabelPrinterName(event.target.value)} style={fieldStyle} placeholder="XP-420B" />
              {availablePrinters.length ? (
                <select value={labelPrinterName} onChange={(event) => setLabelPrinterName(event.target.value)} style={fieldStyle}>
                  <option value="">Select installed label printer</option>
                  {availablePrinters.map((printer) => (
                    <option key={`label-${printer.name}`} value={printer.name}>
                      {printer.name}{printer.isDefault ? ' · Default' : ''}{printer.driverName ? ` · ${printer.driverName}` : ''}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveProfiles()} disabled={saving || !canManageSettings}>
                Save profiles
              </Button>
              <Button variant="outline" onClick={() => void refreshHealth()} disabled={!effectiveAgentUrl}>
                Refresh health
              </Button>
              <Button variant="outline" onClick={() => void refreshPrinters()} disabled={!effectiveAgentUrl}>
                Refresh printers
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      ) : null}

      {(!compact || activeTab === 'status') ? (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Live hardware status</CardTitle>
            <CardDescription>Shows whether the local workstation is ready for the selected standard setup.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={printError ? 'destructive' : 'secondary'}>{printError ? 'Offline' : 'Online'}</Badge>
              <Badge variant="outline">Receipt: {printHealth?.printerName || receiptPrinterName || 'Not set'}</Badge>
              <Badge variant="outline">Label: {printHealth?.labelPrinterName || labelPrinterName || 'Not set'}</Badge>
            </div>
            <div className="text-sm text-muted-foreground leading-relaxed">
              {printError ? `Unavailable: ${printError}` : 'The local agent is reachable and can receive silent print jobs.'}
            </div>
            {printHealth?.features ? (
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Receipt printing: {printHealth.features.receiptPrinting ? 'Yes' : 'No'}</div>
                <div>Label printing: {printHealth.features.labelPrinting ? 'Yes' : 'No'}</div>
                <div>Cash drawer: {printHealth.features.cashDrawer ? 'Yes' : 'No'}</div>
                <div>Barcode printing: {printHealth.features.barcodePrinting ? 'Yes' : 'No'}</div>
              </div>
            ) : null}
            {availablePrinters.length ? (
              <div className="grid gap-2 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">Installed printer queues</div>
                {availablePrinters.map((printer) => (
                  <div key={printer.name}>
                    {printer.name}{printer.isDefault ? ' · Default' : ''}{printer.driverName ? ` · ${printer.driverName}` : ''}{printer.portName ? ` · ${printer.portName}` : ''}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void testReceipt()} disabled={!effectiveAgentUrl}>Test receipt</Button>
              <Button variant="outline" onClick={() => void testLabel()} disabled={!effectiveAgentUrl}>Test label</Button>
              {remoteProfile?.cashDrawerModel ? (
                <Button variant="outline" onClick={() => void testDrawer()} disabled={!effectiveAgentUrl}>Test drawer</Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Standard hardware list</CardTitle>
            <CardDescription>Recommended standard models for the two supported workstation types.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {standardBundles.map((bundle) => (
              <div key={bundle.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="font-medium">{bundle.name}</div>
                <div className="mt-1 text-muted-foreground">{bundle.description}</div>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                  <div>Printer: {bundle.receiptPrinterModel || 'HP / Canon office laser printer'}</div>
                  <div>Label printer: {bundle.labelPrinterModel}</div>
                  <div>Barcode scanner: {bundle.barcodeScannerModel}</div>
                  {bundle.cashDrawerModel ? <div>Cash drawer: {bundle.cashDrawerModel}</div> : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      ) : null}

      {(!compact || activeTab === 'guides') ? (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Auto-start setup</CardTitle>
            <CardDescription>Use the included scripts so silent printing starts with the workstation login.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground leading-relaxed">
            <div>Windows script: <code>{autostart?.windowsScript || 'print-agent/scripts/install-windows-task.ps1'}</code></div>
            <div>macOS script: <code>{autostart?.macScript || 'print-agent/scripts/install-macos-launchagent.sh'}</code></div>
            <ol className="space-y-2 list-decimal pl-4">
              {windowsSteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <ol className="space-y-2 list-decimal pl-4">
              {macSteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operational notes</CardTitle>
            <CardDescription>Helpful reminders for the store team.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground leading-relaxed">
            <ul className="space-y-2 list-disc pl-4">
              {hardwareNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="outline">
                <Link href="/pos">Open POS drawer test</Link>
              </Button>
            </div>
            <p>{message}</p>
          </CardContent>
        </Card>
      </div>
      ) : null}
    </div>
  );
}
