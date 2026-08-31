'use client';

import { useState } from 'react';
import { parseBatchPaste } from '@/lib/barcode-parser';
import type { TrackingField } from './tracking-input';

export function BatchPasteTab({
  fields,
  onAddUnits,
}: {
  fields: TrackingField[];
  onAddUnits: (units: Record<string, string>[]) => void;
}) {
  const [text, setText] = useState('');
  const [parsedCount, setParsedCount] = useState(0);

  const fieldKeys = fields.map((f) => f.fieldKey);
  const fieldLabels = fields.map((f) => f.fieldLabel);

  const handleParse = () => {
    if (!text.trim()) return;
    const units = parseBatchPaste(text, fieldKeys);
    onAddUnits(units);
    setParsedCount(units.length);
    setText('');
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Paste one unit per line. Fields separated by tab or comma.
        {fieldLabels.length > 0 && (
          <span> Expected columns: {fieldLabels.join(', ')}</span>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={`IMEI or serial per line...\n\nExample:\n123456789012345\n987654321098765`}
        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleParse}
          disabled={!text.trim()}
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Parse & Add
        </button>
        {parsedCount > 0 && (
          <span className="text-xs text-muted-foreground">Added {parsedCount} units</span>
        )}
      </div>
    </div>
  );
}
