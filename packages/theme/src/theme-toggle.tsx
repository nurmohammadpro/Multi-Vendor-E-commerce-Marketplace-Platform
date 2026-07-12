'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme, type ThemeName } from './theme-provider';

const THEMES: Array<{ id: ThemeName; label: string }> = [
  { id: 'slate-pro', label: 'Slate Pro' },
  { id: 'stone-sky', label: 'Stone & Sky' },
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
        className="inline-flex items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Switch theme"
      >
        {resolvedMode === 'dark' ? '🌙' : '☀️'}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[180px] rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          {/* Theme selector */}
          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  active
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <span className="text-[11px]">
                  {t.id === 'slate-pro' ? '◐' : '✦'}
                </span>
                {t.label}
              </button>
            );
          })}

          {/* Separator */}
          <div className="my-1.5 border-t border-border" />

          {/* Mode selector */}
          <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  active
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <span className="text-[10px]">
                  {value === 'light'
                    ? '☀️'
                    : value === 'dark'
                      ? '🌙'
                      : '💻'}
                </span>
                {MODE_LABELS[value]}
                {value === 'system' && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {resolvedMode === 'dark' ? '🌙' : '☀️'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
