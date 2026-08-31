'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsUpDown, X } from 'lucide-react';

import { fieldStyle } from '../app/merchflow-theme';

type Option = {
  value: string;
  label: string;
  group?: string;
  indent?: boolean;
};

type SearchableSelectProps = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  emptyMessage = 'No options found',
  disabled = false,
  className,
  style,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? '',
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.group && o.group.toLowerCase().includes(q)),
    );
  }, [options, query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSelect = (opt: Option) => {
    onChange(opt.value);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
  };

  return (
    <div ref={containerRef} data-searchable-select style={{ position: 'relative', ...style }} className={className}>
      {/* Trigger */}
      <button
        data-searchable-select-trigger
        type="button"
        onClick={() => { if (!disabled) setOpen((prev) => !prev); }}
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
          {value ? (
            <span
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              style={{ cursor: 'pointer', display: 'flex', padding: 2, borderRadius: 4, color: '#94a3b8' }}
            >
              <X size={13} />
            </span>
          ) : null}
          <ChevronsUpDown size={14} style={{ color: '#94a3b8' }} />
        </div>
      </button>

      {/* Dropdown */}
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
            borderRadius: 10,
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search..."
              style={{
                ...fieldStyle,
                width: '100%',
                fontSize: 13,
                padding: '7px 10px',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length === 1) {
                  handleSelect(filtered[0]);
                }
                if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
            />
          </div>

          {/* Options list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
            {filtered.length > 0 ? (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt)}
                    style={{
                      padding: '8px 10px',
                      paddingLeft: opt.indent ? 24 : 10,
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 400,
                      background: isSelected ? 'var(--muted)' : 'transparent',
                      color: isSelected ? 'var(--foreground)' : 'var(--foreground)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {opt.label}
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '12px 10px', color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
