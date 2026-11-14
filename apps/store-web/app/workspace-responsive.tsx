'use client';

import { useEffect, useState, type CSSProperties } from 'react';

import { merchflowColors, subtleButtonStyle } from './merchflow-theme';

export function useCompactLayout(maxWidth = 1024) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [maxWidth]);

  return compact;
}

export function WorkspaceTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: string; label: string }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        padding: 8,
        borderRadius: 6,
        border: `1px solid ${merchflowColors.border}`,
        background: merchflowColors.backgroundAlt,
      }}
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            style={{
              ...subtleButtonStyle,
              minHeight: 32,
              background: selected ? 'var(--card)' : merchflowColors.backgroundAlt,
              border: selected ? `1px solid ${merchflowColors.borderStrong}` : `1px solid ${merchflowColors.border}`,
              color: selected ? merchflowColors.ink : merchflowColors.muted,
              boxShadow: selected ? `0 1px 2px ${merchflowColors.shadowStrong}` : 'none',
              fontWeight: selected ? 600 : 500,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export const stackedFilterGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 8,
};

/** Flex row for search input + button pairs — input stretches, button stays fixed. */
export const searchRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'stretch',
};
