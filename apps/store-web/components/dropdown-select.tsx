'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, X } from 'lucide-react';

import { fieldStyle } from '../app/merchflow-theme';

export type DropdownOption = { value: string; label: string; group?: string };

type InternalOption = DropdownOption & { __isNew?: boolean };

export function DropdownSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  onCreate,
  emptyMessage = 'No options found',
  addLabel = 'New',
  disabled,
  className,
  style,
}: {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onCreate?: (name: string) => Promise<{ value: string; label: string } | null>;
  emptyMessage?: string;
  addLabel?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          (o.group && o.group.toLowerCase().includes(query.toLowerCase())),
      )
    : options;

  const hasMatches = filtered.length > 0;
  const matchesExact = filtered.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setQuery('');
    setOpen(false);
  };

  const submitCreate = async () => {
    if (!onCreate || !creatingName?.trim() || creatingBusy) return;
    setCreatingBusy(true);
    setError('');
    try {
      const result = await onCreate(creatingName.trim());
      if (result) {
        onChange(result.value);
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
    <div
      ref={containerRef}
      data-dropdown-select
      style={{ position: 'relative', ...style }}
      className={className}
    >
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen((p) => !p); }}
        disabled={disabled}
        style={{
          ...fieldStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          background: disabled ? '#f1f5f9' : 'var(--card)',
          width: '100%',
        }}
      >
        <span style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: value ? 'inherit' : '#94a3b8',
          fontSize: 13,
        }}>
          {selectedLabel || placeholder}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {value && !open ? (
            <span
              onClick={(e) => { e.stopPropagation(); handleSelect(''); }}
              style={{ cursor: 'pointer', display: 'flex', padding: 2, borderRadius: 4, color: '#94a3b8' }}
            >
              <X size={13} />
            </span>
          ) : null}
          <ChevronsUpDown size={14} style={{ color: '#94a3b8' }} />
        </div>
      </button>

      {/* Dropdown panel */}
      {open ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
            zIndex: 100,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            maxHeight: 280,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '8px 8px 4px' }}>
            <input
              ref={inputRef}
              value={creatingName !== null ? creatingName : query}
              onChange={(e) => {
                if (creatingName !== null) setCreatingName(e.target.value);
                else setQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (creatingName !== null) {
                  if (e.key === 'Enter') { e.preventDefault(); void submitCreate(); }
                  if (e.key === 'Escape') { setCreatingName(null); setError(''); }
                } else {
                  if (e.key === 'Enter' && filtered.length === 1) handleSelect(filtered[0].value);
                  if (e.key === 'Escape') setOpen(false);
                }
              }}
              placeholder="Type to search…"
              style={{ ...fieldStyle, width: '100%', fontSize: 13, padding: '5px 8px' }}
            />
          </div>

          {/* Options list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
            {creatingName === null ? (
              <>
                {filtered.slice(0, 50).map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => handleSelect(opt.value)}
                      style={{
                        padding: '5px 8px',
                        paddingLeft: opt.group ? 22 : 10,
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 400,
                        background: isSelected ? 'var(--muted)' : 'transparent',
                        color: isSelected ? 'var(--foreground)' : 'var(--foreground)',
                      }}
                    >
                      {opt.label}
                    </div>
                  );
                })}
                {!hasMatches && query.trim() && !matchesExact ? (
                  <div style={{ padding: '8px 10px', color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
                    {emptyMessage}
                  </div>
                ) : null}
                {onCreate && !hasMatches && query.trim() && !matchesExact ? (
                  <button
                    type="button"
                    onClick={() => setCreatingName(query.trim())}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#0f172a',
                      background: '#f8fafc',
                      border: 'none',
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    + {addLabel} "{query.trim()}"
                  </button>
                ) : null}
                {onCreate && hasMatches && query.trim() && !matchesExact ? (
                  <button
                    type="button"
                    onClick={() => setCreatingName(query.trim())}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#0f172a',
                      background: '#f8fafc',
                      border: 'none',
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    + {addLabel} "..."
                  </button>
                ) : null}
              </>
            ) : (
              <div style={{ padding: 10, display: 'grid', gap: 8, background: '#f8fafc' }}>
                <input
                  autoFocus
                  value={creatingName}
                  onChange={(e) => setCreatingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void submitCreate(); }
                    if (e.key === 'Escape') { setCreatingName(null); setError(''); }
                  }}
                  style={{ ...fieldStyle, fontSize: 13 }}
                />
                {error ? <span style={{ fontSize: 11.5, color: '#dc2626' }}>{error}</span> : null}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => void submitCreate()}
                    disabled={creatingBusy || !creatingName.trim()}
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: 'none',
                      background: '#0f172a',
                      color: '#fff',
                      cursor: creatingBusy ? 'wait' : 'pointer',
                    }}
                  >
                    {creatingBusy ? 'Creating…' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreatingName(null); setError(''); }}
                    style={{
                      padding: '5px 8px',
                      fontSize: 12.5,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
