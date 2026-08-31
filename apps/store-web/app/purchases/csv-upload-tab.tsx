'use client';

import { useRef, useState } from 'react';
import { parseCsvUpload } from '@/lib/barcode-parser';
import type { TrackingField } from './tracking-input';

export function CsvUploadTab({
  fields,
  onAddUnits,
}: {
  fields: TrackingField[];
  onAddUnits: (units: Record<string, string>[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedCount, setParsedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fieldKeys = fields.map((f) => f.fieldKey);
  const fieldLabels = fields.map((f) => f.fieldLabel);

  const handleFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target?.result as string;
      if (!csvText) {
        setError('Empty file');
        return;
      }
      const units = parseCsvUpload(csvText, fieldKeys, fieldLabels);
      if (units.length === 0) {
        setError('No valid rows found. Check that your CSV has a header row matching the tracking fields.');
        return;
      }
      onAddUnits(units);
      setParsedCount(units.length);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Upload a CSV file with columns matching tracking fields.
        {fieldLabels.length > 0 && (
          <span> Expected columns: {fieldLabels.join(', ')}</span>
        )}
      </div>
      <div
        onClick={() => fileInputRef.current?.click()}
        className="flex cursor-pointer items-center justify-center rounded-md border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/30"
      >
        Click to upload CSV
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {parsedCount > 0 && (
        <div className="text-xs text-green-600">Added {parsedCount} units from CSV</div>
      )}
      {error && (
        <div className="text-xs text-destructive">{error}</div>
      )}
    </div>
  );
}
