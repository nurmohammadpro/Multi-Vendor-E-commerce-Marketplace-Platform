'use client';

import { useState } from 'react';

interface BatchImportProps {
  storeId: string;
  onImportComplete: () => Promise<void>;
}

export function BatchImport({ storeId, onImportComplete }: BatchImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setCsvContent(text);
  };

  const parseCsv = (content: string) => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV must have header row and at least one data row');

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const requiredHeaders = ['serialnumber', 'devicemodel', 'skuid', 'batchcode'];

    const missing = requiredHeaders.filter(h => !headers.includes(h));
    if (missing.length > 0) {
      throw new Error(`Missing required columns: ${missing.join(', ')}`);
    }

    const serials = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      const values = lines[i].split(',').map(v => v.trim());
      const row: any = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || null;
      });

      serials.push({
        serialNumber: row.serialnumber,
        imeiNumber: row.iminumber || row.imei || undefined,
        deviceModel: row.devicemodel,
        skuId: row.skuid,
        batchCode: row.batchcode,
        color: row.color || undefined,
        specifications: row.specifications ? JSON.parse(row.specifications) : undefined,
      });
    }

    return serials;
  };

  const handleImport = async () => {
    if (!csvContent) {
      setError('Please select a CSV file');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const serials = parseCsv(csvContent);
      console.log('[v0] Parsed serials:', serials);

      const response = await fetch('/api/v1/inventory/serials/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-store-id': storeId,
        },
        body: JSON.stringify({ serials }),
      });

      if (!response.ok) {
        throw new Error('Failed to import serials');
      }

      const importResult = await response.json();
      setResult(importResult);
      setCsvContent('');

      await onImportComplete();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[v0] Import error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        {isOpen ? 'Cancel' : 'Import Serials (CSV)'}
      </button>

      {isOpen && (
        <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Import Device Serials</h3>
            <p className="text-sm text-gray-600 mb-4">
              Upload a CSV file with the following columns: serialNumber, deviceModel, skuId, batchCode, (optional) imeiNumber, color
            </p>

            <div className="mb-4">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            {csvContent && (
              <div className="mb-4 p-2 bg-white border rounded text-xs font-mono max-h-40 overflow-y-auto">
                {csvContent.split('\n').slice(0, 5).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                {csvContent.split('\n').length > 5 && (
                  <div className="text-gray-500">
                    ... and {csvContent.split('\n').length - 5} more rows
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}

            {result && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm">
                <p className="text-green-700 font-semibold">Import Complete!</p>
                <p className="text-green-600 mt-1">Imported: {result.imported}</p>
                {result.failed > 0 && (
                  <>
                    <p className="text-red-600 mt-1">Failed: {result.failed}</p>
                    <div className="mt-2 text-xs">
                      {result.errors?.map((err: any, i: number) => (
                        <p key={i} className="text-red-600">
                          {err.serial}: {err.error}
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!csvContent || isLoading}
              className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {isLoading ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      )}

      {/* CSV Template */}
      <details className="border rounded p-3 bg-blue-50 text-sm">
        <summary className="cursor-pointer font-semibold text-blue-900">Download CSV Template</summary>
        <div className="mt-3 space-y-2">
          <p className="text-blue-800">Sample CSV format:</p>
          <pre className="bg-white p-2 rounded border text-xs overflow-x-auto font-mono">
            {`serialNumber,imeiNumber,deviceModel,skuId,batchCode,color
SN-2024-001,358474081234567,iPhone 15 Pro,sku-iphone15,BATCH-2024-Q1,Space Black
SN-2024-002,358474081234568,iPhone 15 Pro,sku-iphone15,BATCH-2024-Q1,Silver
SN-2024-003,,MacBook Pro 16,sku-mbp16,BATCH-2024-Q1,Space Gray`}
          </pre>
          <button
            onClick={() => {
              const csv = `serialNumber,imeiNumber,deviceModel,skuId,batchCode,color
SN-EXAMPLE-001,,Example Device,sku-example,BATCH-EXAMPLE,Color`;
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'serials-template.csv';
              a.click();
            }}
            className="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
          >
            Download Template
          </button>
        </div>
      </details>
    </div>
  );
}
