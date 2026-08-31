'use client';

import { useEffect, useState } from 'react';
import { X, Search, Loader2, Check } from 'lucide-react';

type DeviceSerial = {
  id: string;
  serial_number: string;
  imei_number?: string | null;
  tracking_values?: Record<string, string> | null;
  status: string;
  sku_id: string;
  sku_code?: string;
  product_name?: string;
};

export function SerialPickerModal({
  open,
  skuId,
  skuCode,
  productName,
  onSelect,
  onClose,
}: {
  open: boolean;
  skuId: string;
  skuCode: string;
  productName: string;
  onSelect: (serials: Array<{ serialId: string; serialNumber: string; imei?: string | null }>) => void;
  onClose: () => void;
}) {
  const [serials, setSerials] = useState<DeviceSerial[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/inventory/device-serials?skuId=${skuId}&status=in_stock&limit=200`)
      .then((res) => res.json())
      .then((data) => {
        setSerials(data.serials || data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open, skuId]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setSearch('');
      setSerials([]);
    }
  }, [open]);

  const filtered = serials.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.serial_number?.toLowerCase().includes(q) ||
      s.imei_number?.toLowerCase().includes(q) ||
      Object.values(s.tracking_values || {}).some((v) => v?.toLowerCase().includes(q))
    );
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const selectedSerials = serials
      .filter((s) => selected.has(s.id))
      .map((s) => ({
        serialId: s.id,
        serialNumber: s.serial_number,
        imei: s.imei_number,
      }));
    onSelect(selectedSerials);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg border shadow-lg w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="font-semibold text-sm">Select Serial Number</h3>
            <p className="text-xs text-muted-foreground">{productName} · {skuCode}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b px-4 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by serial, IMEI..."
              className="h-8 w-full rounded-md border bg-transparent pl-8 pr-3 text-sm focus-visible:border-ring outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {serials.length === 0 ? 'No in-stock serials found' : 'No matches'}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((serial) => (
                <button
                  key={serial.id}
                  onClick={() => toggle(serial.id)}
                  className={`w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50 ${
                    selected.has(serial.id) ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className={`size-4 rounded-full border flex items-center justify-center ${
                    selected.has(serial.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
                  }`}>
                    {selected.has(serial.id) && <Check className="size-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs">{serial.serial_number}</div>
                    {serial.imei_number && (
                      <div className="text-xs text-muted-foreground">IMEI: {serial.imei_number}</div>
                    )}
                    {serial.tracking_values && Object.keys(serial.tracking_values).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(serial.tracking_values).map(([key, val]) => (
                          <span key={key} className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px]">
                            {key}: {val}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-8 rounded-md border bg-transparent px-3 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Confirm ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
