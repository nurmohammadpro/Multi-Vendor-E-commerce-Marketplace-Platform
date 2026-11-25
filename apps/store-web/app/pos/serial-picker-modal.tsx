'use client';

import { useEffect, useState } from 'react';
import { X, Search, Loader2, Check } from 'lucide-react';

import { fieldStyle, neutralButtonStyle, subtleButtonStyle } from '../merchflow-theme';

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

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(15, 23, 42, 0.5)',
};

const panelStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 520,
  maxHeight: '82vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--card)',
  color: 'var(--card-foreground)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  boxShadow: '0 20px 45px rgba(15, 23, 42, 0.28)',
  overflow: 'hidden',
};

export function SerialPickerModal({
  open,
  skuId,
  skuCode,
  productName,
  preferredSerialId,
  onSelect,
  onClose,
}: {
  open: boolean;
  skuId: string;
  skuCode: string;
  productName: string;
  preferredSerialId?: string | null;
  onSelect: (serials: Array<{ serialId: string; serialNumber: string; imei?: string | null }>) => void;
  onClose: () => void;
}) {
  const [serials, setSerials] = useState<DeviceSerial[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !skuId) return;
    let active = true;
    setLoading(true);
    fetch(`/api/inventory/device-serials?skuId=${encodeURIComponent(skuId)}&status=in_stock&limit=200`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const list: DeviceSerial[] = data.serials || data || [];
        setSerials(list);
        if (preferredSerialId && list.some((s) => s.id === preferredSerialId)) {
          setSelected(new Set([preferredSerialId]));
        }
      })
      .catch(() => {
        if (active) setSerials([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, skuId, preferredSerialId]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setSearch('');
      setSerials([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Select serial / IMEI</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {productName} · {skuCode}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ ...subtleButtonStyle, padding: 4, background: 'none', border: 'none' }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--muted-foreground)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by serial, IMEI..."
              autoFocus
              style={{ ...fieldStyle, width: '100%', paddingLeft: 28, fontSize: 13 }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite', color: 'var(--muted-foreground)' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 12px', fontSize: 13, color: 'var(--muted-foreground)' }}>
              {serials.length === 0 ? 'No in-stock serials found for this item' : 'No matches'}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {filtered.map((serial) => {
                const isSelected = selected.has(serial.id);
                return (
                  <button
                    key={serial.id}
                    onClick={() => toggle(serial.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--muted)' : 'var(--card)',
                      cursor: 'pointer',
                      font: 'inherit',
                    }}
                  >
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--muted-foreground)'}`,
                      background: isSelected ? 'var(--primary)' : 'transparent',
                      color: 'var(--primary-foreground)',
                    }}>
                      {isSelected && <Check style={{ width: 11, height: 11 }} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{serial.serial_number}</span>
                      {serial.imei_number ? (
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--muted-foreground)' }}>IMEI: {serial.imei_number}</span>
                      ) : null}
                      {serial.tracking_values && Object.keys(serial.tracking_values).length > 0 ? (
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {Object.entries(serial.tracking_values).map(([key, val]) => (
                            <span key={key} style={{ background: 'var(--muted)', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>
                              {key}: {val}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={neutralButtonStyle}>Cancel</button>
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--primary)',
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
                fontSize: 13,
                fontWeight: 500,
                cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                opacity: selected.size === 0 ? 0.5 : 1,
              }}
            >
              Confirm ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
