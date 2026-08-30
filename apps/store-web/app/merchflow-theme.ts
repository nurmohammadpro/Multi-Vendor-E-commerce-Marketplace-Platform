import type { CSSProperties } from 'react';

/**
 * Theme-aware color tokens.
 * Every value is a CSS variable reference so that inline styles
 * automatically react to theme/mode switches.
 */
export const merchflowColors = {
  background: 'var(--background)',
  backgroundAlt: 'var(--muted)',
  backgroundRaised: 'var(--secondary)',
  ink: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  surface: 'var(--card)',
  surfaceAlt: 'var(--card)',
  surfaceSoft: 'var(--background)',
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',
  accent: 'var(--accent)',
  accentSoft: 'var(--accent-soft)',
  accentDeep: 'var(--accent-deep)',
  shadow: 'var(--shadow)',
  shadowStrong: 'var(--shadow-strong)',
} as const;

export const pageShellStyle: CSSProperties = {
  minHeight: 'auto',
  padding: 0,
  color: merchflowColors.ink,
  background: 'transparent',
  fontFamily:
    'var(--font-geist-sans), Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

export const pageFrameStyle: CSSProperties = {
  maxWidth: 1280,
  margin: '0 auto',
  display: 'grid',
  gap: 8,
};

export const sectionIntroStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
  maxWidth: 760,
};

export const pageIntroCardStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  padding: 10,
  borderRadius: 4,
  border: `1px solid ${merchflowColors.border}`,
  background: merchflowColors.surfaceSoft,
  boxShadow: `0 1px 2px ${merchflowColors.shadow}`,
};

export const sectionPanelStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 10,
  borderRadius: 4,
  border: `1px solid ${merchflowColors.border}`,
  background: merchflowColors.backgroundAlt,
};

export const sectionHeaderRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};

export const sectionLabelStyle: CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 700,
  color: merchflowColors.muted,
};

export const pageTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(20px, 2vw, 28px)',
  lineHeight: 1.15,
  letterSpacing: '-0.025em',
  fontWeight: 600,
};

export const pageLeadStyle: CSSProperties = {
  margin: 0,
  maxWidth: 65 * 8,
  fontSize: 13,
  lineHeight: 1.45,
  color: merchflowColors.muted,
};

export const surfaceCardStyle: CSSProperties = {
  padding: 10,
  borderRadius: 4,
  background: merchflowColors.surface,
  border: `1px solid ${merchflowColors.borderStrong}`,
  boxShadow: `0 1px 2px ${merchflowColors.shadow}`,
};

export const surfaceCardStrongStyle: CSSProperties = {
  ...surfaceCardStyle,
  background: merchflowColors.surfaceSoft,
  border: `1px solid ${merchflowColors.border}`,
};

export const compactSurfaceCardStyle: CSSProperties = {
  padding: 8,
  borderRadius: 4,
  background: merchflowColors.surfaceAlt,
  border: `1px solid ${merchflowColors.borderStrong}`,
  boxShadow: 'none',
};

export const metricLabelStyle: CSSProperties = {
  opacity: 1,
  marginBottom: 2,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: merchflowColors.muted,
};

export const metricValueStyle: CSSProperties = {
  fontSize: 20,
  lineHeight: 1.1,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  color: merchflowColors.ink,
};

export const metricNoteStyle: CSSProperties = {
  marginBottom: 0,
  opacity: 1,
  lineHeight: 1.5,
  color: merchflowColors.muted,
};

export const tokenMutedStyle: CSSProperties = {
  marginBottom: 0,
  lineHeight: 1.4,
  fontSize: 13,
  fontWeight: 400,
  color: merchflowColors.muted,
};

export const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  borderRadius: 4,
  border: `1px solid ${merchflowColors.borderStrong}`,
  background: 'var(--card)',
  color: merchflowColors.ink,
  font: 'inherit',
  fontSize: 12,
  outline: 'none',
  minHeight: 28,
};

const buttonBaseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 28,
  padding: '0 10px',
  borderRadius: 4,
  font: 'inherit',
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  boxShadow: 'none',
};

export const solidButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: `1px solid ${merchflowColors.ink}`,
  background: merchflowColors.ink,
  color: 'var(--background)',
};

export const neutralButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: `1px solid ${merchflowColors.borderStrong}`,
  background: 'var(--card)',
  color: merchflowColors.ink,
};

export const accentButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: '1px solid var(--foreground)',
  background: 'var(--foreground)',
  color: 'var(--background)',
};

export const dangerButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: '1px solid var(--destructive)',
  background: 'var(--destructive)',
  color: '#ffffff',
};

export const subtleButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: `1px solid ${merchflowColors.border}`,
  background: merchflowColors.backgroundAlt,
  color: merchflowColors.ink,
};

export const ghostButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: `1px solid ${merchflowColors.border}`,
  background: 'transparent',
  color: merchflowColors.ink,
};

export const tableActionButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  minHeight: 24,
  padding: '0 8px',
  border: `1px solid ${merchflowColors.border}`,
  background: 'transparent',
  color: merchflowColors.ink,
};

export const gray800ButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: '1px solid var(--primary)',
  background: 'var(--primary)',
  color: 'var(--primary-foreground)',
};

export const searchButtonStyle: CSSProperties = {
  ...gray800ButtonStyle,
  minWidth: 80,
  minHeight: 28,
  padding: '0 14px',
};

export const primaryButtonStyle = solidButtonStyle;
export const secondaryButtonStyle = neutralButtonStyle;

export const pillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 6px',
  borderRadius: 4,
  border: `1px solid ${merchflowColors.border}`,
  background: 'var(--card)',
  fontSize: 11,
  fontWeight: 500,
  color: merchflowColors.ink,
};

export const emptyStateStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
  padding: 8,
  borderRadius: 4,
  border: `1px dashed ${merchflowColors.border}`,
  color: merchflowColors.muted,
  background: merchflowColors.surfaceSoft,
  lineHeight: 1.45,
  fontSize: 12,
};

export const tableWrapStyle: CSSProperties = {
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  scrollBehavior: 'smooth',
  border: `1px solid ${merchflowColors.borderStrong}`,
  borderRadius: 4,
  background: 'var(--card)',
};

export const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};

export const tableHeaderCellStyle: CSSProperties = {
  padding: '7px 10px',
  textAlign: 'left',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 700,
  color: merchflowColors.muted,
  borderBottom: `1px solid ${merchflowColors.border}`,
  background: merchflowColors.backgroundAlt,
  whiteSpace: 'nowrap',
};

export const tableCellStyle: CSSProperties = {
  padding: '7px 10px',
  borderBottom: `1px solid ${merchflowColors.border}`,
  color: merchflowColors.ink,
  verticalAlign: 'top',
};
