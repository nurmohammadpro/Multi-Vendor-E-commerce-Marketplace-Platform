'use client';

import { useEffect, useState, type CSSProperties } from 'react';

import { motocoreColors, subtleButtonStyle } from './motocore-theme';

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
        borderRadius: 8,
        border: `1px solid ${motocoreColors.border}`,
        background: motocoreColors.backgroundAlt,
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
              background: selected ? '#ffffff' : 'transparent',
              border: selected ? `1px solid ${motocoreColors.borderStrong}` : '1px solid transparent',
              color: selected ? motocoreColors.ink : motocoreColors.muted,
              boxShadow: selected ? `0 1px 2px ${motocoreColors.shadow}` : 'none',
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
