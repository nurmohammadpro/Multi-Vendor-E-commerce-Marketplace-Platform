'use client';

import { useEffect, useState } from 'react';

import { fieldStyle, subtleButtonStyle, surfaceCardStyle, secondaryButtonStyle } from '../merchflow-theme';

type Transfer = { id: string; transfer_no: string; from_name: string; to_name: string; transfer_date: string; items: number; note?: string | null };

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const r = await fetch(input, init);
  const p = await r.json().catch(() => null);
  if (!r.ok) throw new Error((p as any)?.error || `Request failed with ${r.status}`);
  return p as T;
}

export function TransfersPanel({ locations: locationsProp, canTransfer }: { locations?: Array<{ id: string; name: string }>; canTransfer: boolean }) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Array<{ skuId: string; skuCode: string; productName: string; qty: string }>>([]);
  const [skuQuery, setSkuQuery] = useState('');
  const [skuOptions, setSkuOptions] = useState<Array<{ id: string; sku_code: string; product_name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadTransfers = () => {
    readJson<{ transfers: Transfer[] }>('/api/inventory/transfers')
      .then((p) => setTransfers(p.transfers ?? []))
      .catch((e) => setMessage(e.message));
  };

  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>(locationsProp ?? []);

  useEffect(() => {
    if (locationsProp?.length) { setLocations(locationsProp); return; }
    fetch('/api/inventory/locations')
      .then((r) => r.json())
      .then((payload) => setLocations(payload.locations ?? []))
      .catch(() => setLocations([]));
  }, []);

  useEffect(() => { loadTransfers(); }, []);

  const searchSkus = () => {
    const q = skuQuery.trim();
    if (!q) return;
    readJson<{ skus: Array<{ id: string; sku_code: string; product_name: string }> }>(`/api/catalog/skus/search?q=${encodeURIComponent(q)}&limit=10`)
      .then((p) => setSkuOptions(p.skus ?? []))
      .catch((e) => setMessage(e.message));
  };

  const submit = async () => {
    if (!from || !to || from === to) { setMessage('Pick two different outlets.'); return; }
    const items = lines.map((l) => ({ skuId: l.skuId, qty: Number(l.qty) })).filter((i) => i.qty > 0);
    if (!items.length) { setMessage('Add at least one line.'); return; }
    setBusy(true);
    try {
      await readJson('/api/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationFrom: from, locationTo: to, note: note || undefined, items }),
      });
      setMessage('Transfer completed — stock moved.');
      setLines([]); setNote('');
      loadTransfers();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };

  const others = (id: string) => locations.filter((l) => l.id !== id);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {canTransfer ? (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>New Transfer</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value === to) setTo(''); }} style={fieldStyle} aria-label="From outlet">
                <option value="">From outlet</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <select value={to} onChange={(e) => setTo(e.target.value)} style={fieldStyle} aria-label="To outlet">
                <option value="">To outlet</option>
                {others(from).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchSkus(); } }} style={{ ...fieldStyle, flex: 1 }} placeholder="Search SKU to transfer…" />
              <button onClick={searchSkus} style={subtleButtonStyle}>Search</button>
            </div>
            {skuOptions.length > 0 ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 140, overflowY: 'auto' }}>
                {skuOptions.map((opt) => (
                  <button key={opt.id} onClick={() => { setLines((c) => c.some((l) => l.skuId === opt.id) ? c : [...c, { skuId: opt.id, skuCode: opt.sku_code, productName: opt.product_name, qty: '1' }]); setSkuOptions([]); setSkuQuery(''); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    {opt.product_name} ({opt.sku_code})
                  </button>
                ))}
              </div>
            ) : null}
            {lines.map((line, idx) => (
              <div key={line.skuId} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{line.productName}<div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{line.skuCode}</div></div>
                <input type="number" min="1" value={line.qty} onChange={(e) => setLines((c) => c.map((l, i) => i === idx ? { ...l, qty: e.target.value } : l))} style={{ ...fieldStyle, width: 80, textAlign: 'right' }} aria-label={`Qty for ${line.productName}`} />
                <button onClick={() => setLines((c) => c.filter((_, i) => i !== idx))} style={{ ...subtleButtonStyle, fontSize: 11, color: '#dc2626' }}>✕</button>
              </div>
            ))}
            <input value={note} onChange={(e) => setNote(e.target.value)} style={fieldStyle} placeholder="Note (optional)" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => void submit()} style={secondaryButtonStyle} disabled={busy || !from || !to || from === to || !lines.length}>
                {busy ? 'Transferring…' : 'Transfer Stock'}
              </button>
            </div>
          </div>
        </article>
      ) : null}

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Recent Transfers</h3>
        {transfers.length ? (
          transfers.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
              <div><strong>{t.transfer_no}</strong> · {t.from_name} → {t.to_name}{t.note ? ` · ${t.note}` : ''}</div>
              <div style={{ color: 'var(--muted-foreground)' }}>{t.items} line(s)</div>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>No transfers yet.</div>
        )}
      </article>
      {message ? <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>{message}</p> : null}
    </div>
  );
}
