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
import { fieldStyle } from '../motocore-theme';
import { fetchPrintAgentHealth, openCashDrawer, printLabel, printReceipt, type PrintAgentHealth } from '../../lib/print-agent';

const STORAGE_KEYS = {
  receiptPrinter: 'mvp_hardware_receipt_printer_name',
  labelPrinter: 'mvp_hardware_label_printer_name',
  agentUrl: 'mvp_hardware_print_agent_url',
};

const windowsSteps = [
  'Install the receipt printer driver in Windows.',
  'Confirm the printer works from the OS test page.',
  'Install Node.js 18+ on the workstation.',
  'Run the local print agent from the `print-agent` folder.',
  'Install the login auto-start task.',
  'Restart the PC once and test POS printing again.',
];

const macSteps = [
  'Add the printer in System Settings.',
  'Confirm the printer works from the OS test page.',
  'Install Node.js 18+ on the Mac.',
  'Run the local print agent from the `print-agent` folder.',
  'Install the LaunchAgent for auto-start on login.',
  'Restart the Mac once and test receipt, label, and drawer actions.',
];

const hardwareNotes = [
  'Use ESC/POS-compatible receipt printers for silent receipt printing.',
  'Use USB HID barcode scanners so scans land directly in the focused input.',
  'Keep the print agent on the workstation, not on the VPS.',
  'Use the drawer test button in POS to verify the raw command path.',
];

export function HardwareWorkspace({ canManageSettings }: { canManageSettings: boolean }) {
  const [printHealth, setPrintHealth] = useState<PrintAgentHealth | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [receiptPrinterName, setReceiptPrinterName] = useState('');
  const [labelPrinterName, setLabelPrinterName] = useState('');
  const [agentUrl, setAgentUrl] = useState('http://127.0.0.1:17658');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('Save printer names locally to keep workstation setup consistent.');

  const effectiveAgentUrl = useMemo(() => agentUrl.trim() || 'http://127.0.0.1:17658', [agentUrl]);

  useEffect(() => {
    setReceiptPrinterName(localStorage.getItem(STORAGE_KEYS.receiptPrinter) || '');
    setLabelPrinterName(localStorage.getItem(STORAGE_KEYS.labelPrinter) || '');
    setAgentUrl(localStorage.getItem(STORAGE_KEYS.agentUrl) || 'http://127.0.0.1:17658');
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

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => {
      void refreshHealth();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [effectiveAgentUrl]);

  const savePrinterNames = async () => {
    if (!canManageSettings) {
      setMessage('Only owners and managers can save workstation settings.');
      return;
    }

    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEYS.receiptPrinter, receiptPrinterName.trim());
      localStorage.setItem(STORAGE_KEYS.labelPrinter, labelPrinterName.trim());
      localStorage.setItem(STORAGE_KEYS.agentUrl, effectiveAgentUrl);
      setMessage('Printer names saved on this workstation.');
      await refreshHealth(effectiveAgentUrl);
    } finally {
      setSaving(false);
    }
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
      await printLabel({
        printerName: labelPrinterName || undefined,
        text: 'Label test\nHW-TEST\nPrice: 0.00',
      }, effectiveAgentUrl);
      setMessage('Label test sent successfully.');
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
      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Workstation printer profile</CardTitle>
            <CardDescription>Save the printer names locally on this cashier or manager PC.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Print agent URL</label>
              <input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} style={fieldStyle} placeholder="http://127.0.0.1:17658" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Receipt printer name</label>
              <input value={receiptPrinterName} onChange={(event) => setReceiptPrinterName(event.target.value)} style={fieldStyle} placeholder="XP-Q80A" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Label printer name</label>
              <input value={labelPrinterName} onChange={(event) => setLabelPrinterName(event.target.value)} style={fieldStyle} placeholder="XP-420B" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void savePrinterNames()} disabled={saving || !canManageSettings}>
                Save workstation profile
              </Button>
              <Button variant="outline" onClick={() => void refreshHealth()} disabled={!effectiveAgentUrl}>
                Refresh health
              </Button>
            </div>
            {!canManageSettings ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                Only owners and managers can save workstation printer names.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live hardware status</CardTitle>
            <CardDescription>Shows whether the workstation print agent is reachable.</CardDescription>
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
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void testReceipt()} disabled={!effectiveAgentUrl}>
                Test receipt
              </Button>
              <Button variant="outline" onClick={() => void testLabel()} disabled={!effectiveAgentUrl}>
                Test label
              </Button>
              <Button variant="outline" onClick={() => void testDrawer()} disabled={!effectiveAgentUrl}>
                Test drawer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Windows workstation</CardTitle>
            <CardDescription>Best fit for most cashier PCs.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="text-sm text-muted-foreground leading-relaxed space-y-2 list-decimal pl-4">
              {windowsSteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>macOS workstation</CardTitle>
            <CardDescription>Useful for managers or demo stations.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="text-sm text-muted-foreground leading-relaxed space-y-2 list-decimal pl-4">
              {macSteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Hardware compatibility notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground leading-relaxed space-y-2 list-disc pl-4">
              {hardwareNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild>
              <Link href="/pos">Open POS drawer test</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings">Back to settings</Link>
            </Button>
            <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
