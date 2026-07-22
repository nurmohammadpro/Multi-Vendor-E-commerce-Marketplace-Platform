'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme, type ThemeName } from './theme-provider';

const THEMES: Array<{ id: ThemeName; label: string }> = [
  { id: 'slate-pro', label: 'Slate Pro' },
  { id: 'stone-sky', label: 'Stone & Sky' },
  { id: 'emerald-cream', label: 'Emerald & Cream' },
  { id: 'ocean-sand', label: 'Ocean & Sand' },
];

const MODE_LABELS: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function ThemeToggle() {
  const { theme, setTheme, mode, setMode, resolvedMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeThemeLabel = THEMES.find((item) => item.id === theme)?.label ?? 'Theme';

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const id = setTimeout(() =>
      document.addEventListener('mousedown', handler),
    );
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Switch theme"
      >
        {activeThemeLabel} · {mode === 'system' ? `System (${MODE_LABELS[resolvedMode]})` : MODE_LABELS[mode]}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 min-w-56 rounded-lg border shadow-lg sm:w-64"
          style={{
            backgroundColor: 'var(--popover)',
            borderColor: 'var(--border)',
            padding: '0.375rem',
          }}
        >
          {/* Theme selector */}
          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted-foreground)' }}>
            Theme
          </div>
          {THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'var(--muted)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                className="flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs transition-colors"
                style={{
                  color: active ? 'var(--accent-foreground)' : 'var(--foreground)',
                  backgroundColor: active ? 'var(--accent)' : 'transparent',
                }}
              >
                <span>{t.label}</span>
                {active ? <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--accent-foreground)' }}>Active</span> : null}
              </button>
            );
          })}

          {/* Separator */}
          <div className="my-1.5 border-t" style={{ borderColor: 'var(--border)' }} />

          {/* Mode selector */}
          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted-foreground)' }}>
            Mode
          </div>
          {(['light', 'dark', 'system'] as const).map((value) => {
            const active = mode === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  setOpen(false);
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'var(--muted)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                className="flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs transition-colors"
                style={{
                  color: active ? 'var(--accent-foreground)' : 'var(--foreground)',
                  backgroundColor: active ? 'var(--accent)' : 'transparent',
                }}
              >
                <span>{MODE_LABELS[value]}</span>
                <span className="text-[10px]" style={{ color: active ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }}>
                  {value === 'system' ? `Using ${MODE_LABELS[resolvedMode]}` : active ? 'Active' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
