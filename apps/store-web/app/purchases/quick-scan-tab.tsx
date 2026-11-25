'use client';

import { useState } from 'react';
import { parseBarcode } from '@/lib/barcode-parser';
import type { TrackingField } from './tracking-input';

export function QuickScanTab({
  fields,
  onAddUnit,
}: {
  fields: TrackingField[];
  onAddUnit: (values: Record<string, string>) => void;
}) {
  const [input, setInput] = useState('');
  const [lastParsed, setLastParsed] = useState<{ imei: string | null; serial: string | null } | null>(null);

  const handleScan = () => {
    if (!input.trim()) return;

    const parsed = parseBarcode(input);
    const unitValues: Record<string, string> = {};

    // Map parsed values to tracking fields
    if (parsed.imei) {
      const imeiField = fields.find((f) => f.fieldType === 'imei' || f.fieldKey === 'imei');
      if (imeiField) unitValues[imeiField.fieldKey] = parsed.imei;
    }
    if (parsed.serialNumber) {
      const serialField = fields.find((f) => f.fieldKey === 'serial_number' || f.fieldKey === 'serial');
      if (serialField) {
        unitValues[serialField.fieldKey] = parsed.serialNumber;
      } else {
        // If no serial field, put it in the first text field
        const textField = fields.find((f) => f.fieldType === 'text');
        if (textField) unitValues[textField.fieldKey] = parsed.serialNumber;
      }
    }

    setLastParsed({ imei: parsed.imei, serial: parsed.serialNumber });
    onAddUnit(unitValues);
    setInput('');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          data-enter-nav="false"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScan()}
          placeholder="Scan or paste barcode / IMEI / serial..."
          className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm font-mono focus-visible:border-ring outline-none"
          autoFocus
        />
        <button
          type="button"
          onClick={handleScan}
          disabled={!input.trim()}
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {lastParsed && (
        <div className="rounded-md bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          Last: {lastParsed.imei ? `IMEI ${lastParsed.imei}` : `SN ${lastParsed.serial}`}
        </div>
      )}
    </div>
  );
}
