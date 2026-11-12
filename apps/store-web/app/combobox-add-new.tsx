'use client';

// Searchable combobox with a pinned "+ New …" quick-create action (visible even
// while filtering). Creating posts immediately via `onCreate`, then the new
// option is auto-selected — the user never leaves the form.
import { useRef, useState } from 'react';

import { fieldStyle } from './merchflow-theme';

export type ComboboxOption = { id: string; label: string };

export function ComboboxAddNew({
  value,
  onChange,
  options,
  onCreate,
  placeholder,
  addNewLabel,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (id: string) => void;
  options: ComboboxOption[];
  onCreate: (name: string) => Promise<ComboboxOption | null>;
  placeholder: string;
  addNewLabel: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.id === value);
  const matches = options.filter((option) =>
    option.label.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const openList = () => {
    setFilter('');
    setCreatingName(null);
    setError('');
    setOpen(true);
  };

  const submitCreate = async () => {
    const name = (creatingName ?? filter).trim();
    if (!name || creatingBusy) return;
    setCreatingBusy(true);
    setError('');
    try {
      const created = await onCreate(name);
      if (created) {
        onChange(created.id);
        setOpen(false);
        setCreatingName(null);
      } else {
        setError('Could not create — try a different name.');
      }
    } catch (err) {
      setError((err as Error).message || 'Create failed.');
    } finally {
      setCreatingBusy(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }} onBlur={(event) => {
      if (!containerRef.current?.contains(event.relatedTarget as Node)) {
        setOpen(false);
        setCreatingName(null);
      }
    }}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel || placeholder}
        value={open ? filter : (selected?.label || '')}
        onChange={(event) => { setFilter(event.target.value); setOpen(true); }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (creatingName !== null || (filter.trim() && !matches.some((m) => m.label.toLowerCase() === filter.trim().toLowerCase()))) {
              void submitCreate();
            } else if (matches.length === 1) {
              onChange(matches[0].id);
              setOpen(false);
            }
          } else if (event.key === 'Escape') {
            setOpen(false);
            setCreatingName(null);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        style={fieldStyle}
      />

      {open ? (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40,
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 10px 24px rgba(0,0,0,0.14)', maxHeight: 240, overflowY: 'auto', marginTop: 2,
          }}
        >
          {creatingName === null ? (
            <>
              {matches.slice(0, 50).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => { onChange(option.id); setOpen(false); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                    fontSize: 13, background: option.id === value ? 'rgba(15,23,42,0.05)' : 'transparent',
                    color: 'var(--foreground)', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  {option.label}
                </button>
              ))}
              {matches.length === 0 && filter.trim() ? (
                <div style={{ padding: '7px 10px', fontSize: 12, color: 'var(--muted-foreground)' }}>No matches.</div>
              ) : null}
              <button
                type="button"
                onClick={() => setCreatingName(filter.trim())}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 6, padding: '8px 10px',
                  fontSize: 12.5, fontWeight: 600, color: '#0f172a', background: '#f8fafc',
                  border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', position: 'sticky', bottom: 0,
                }}
              >
                + {addNewLabel}{filter.trim() && !matches.some((m) => m.label.toLowerCase() === filter.trim().toLowerCase()) ? ` "${filter.trim()}"` : '…'}
              </button>
            </>
          ) : (
            <div style={{ padding: 10, display: 'grid', gap: 8, background: '#f8fafc' }}>
              <input
                autoFocus
                data-enter-nav="false"
                value={creatingName}
                onChange={(event) => setCreatingName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submitCreate(); } }}
                placeholder={`New ${addNewLabel.replace(/^New\s+/i, '').replace(/…$/, '')} name`}
                style={{ ...fieldStyle, fontSize: 13 }}
              />
              {error ? <span style={{ fontSize: 11.5, color: '#dc2626' }}>{error}</span> : null}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => void submitCreate()}
                  disabled={creatingBusy || !creatingName.trim()}
                  style={{ flex: 1, padding: '7px 10px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer' }}
                >
                  {creatingBusy ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCreatingName(null); setError(''); }}
                  style={{ padding: '7px 10px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
