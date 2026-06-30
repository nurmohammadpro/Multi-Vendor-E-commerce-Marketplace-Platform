import type { CSSProperties } from 'react';

export const motocoreColors = {
  background: '#f8fafc',
  backgroundAlt: '#f1f5f9',
  backgroundRaised: '#eef2f7',
  ink: '#0f172a',
  muted: '#475569',
  surface: '#ffffff',
  surfaceAlt: '#ffffff',
  surfaceSoft: '#f8fafc',
  border: 'rgba(148, 163, 184, 0.22)',
  borderStrong: 'rgba(100, 116, 139, 0.28)',
  accent: '#2563eb',
  accentSoft: 'rgba(37, 99, 235, 0.12)',
  accentDeep: '#1d4ed8',
  shadow: 'rgba(15, 23, 42, 0.04)',
  shadowStrong: 'rgba(15, 23, 42, 0.08)',
};

export const pageShellStyle: CSSProperties = {
  minHeight: 'auto',
  padding: 0,
  color: motocoreColors.ink,
  background: 'transparent',
  fontFamily:
    'var(--font-geist-sans), Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

export const pageFrameStyle: CSSProperties = {
  maxWidth: 1280,
  margin: '0 auto',
  display: 'grid',
  gap: 10,
};

export const sectionIntroStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  maxWidth: 760,
};

export const pageIntroCardStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  padding: 12,
  borderRadius: 8,
  border: `1px solid ${motocoreColors.border}`,
  background: motocoreColors.surfaceSoft,
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 2px ${motocoreColors.shadow}`,
};

export const sectionPanelStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 12,
  borderRadius: 8,
  border: `1px solid ${motocoreColors.border}`,
  background: motocoreColors.backgroundAlt,
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45)`,
};

export const sectionHeaderRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

export const sectionLabelStyle: CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: motocoreColors.muted,
};

export const pageTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(24px, 2.2vw, 32px)',
  lineHeight: 1.1,
  letterSpacing: '-0.03em',
  fontWeight: 500,
};

export const pageLeadStyle: CSSProperties = {
  margin: 0,
  maxWidth: 65 * 8,
  fontSize: 13,
  lineHeight: 1.45,
  color: motocoreColors.muted,
};

export const surfaceCardStyle: CSSProperties = {
  padding: 12,
  borderRadius: 6,
  background: motocoreColors.surface,
  border: `1px solid ${motocoreColors.borderStrong}`,
  boxShadow: `0 1px 2px ${motocoreColors.shadow}, 0 0 0 1px rgba(255,255,255,0.6) inset`,
};

export const surfaceCardStrongStyle: CSSProperties = {
  ...surfaceCardStyle,
  background: motocoreColors.surfaceSoft,
  border: `1px solid ${motocoreColors.border}`,
};

export const compactSurfaceCardStyle: CSSProperties = {
  padding: 10,
  borderRadius: 6,
  background: motocoreColors.surfaceAlt,
  border: `1px solid ${motocoreColors.borderStrong}`,
  boxShadow: `0 1px 2px ${motocoreColors.shadow}`,
};

export const metricLabelStyle: CSSProperties = {
  opacity: 1,
  marginBottom: 2,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: motocoreColors.muted,
};

export const metricValueStyle: CSSProperties = {
  fontSize: 22,
  lineHeight: 1.05,
  fontWeight: 500,
  letterSpacing: '-0.02em',
  color: motocoreColors.ink,
};

export const metricNoteStyle: CSSProperties = {
  marginBottom: 0,
  opacity: 1,
  lineHeight: 1.5,
  color: motocoreColors.muted,
};

export const tokenMutedStyle: CSSProperties = {
  marginBottom: 0,
  lineHeight: 1.4,
  fontSize: 13,
  color: motocoreColors.muted,
};

export const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 6,
  border: `1px solid ${motocoreColors.border}`,
  background: '#ffffff',
  color: motocoreColors.ink,
  font: 'inherit',
  fontSize: 13,
  outline: 'none',
  minHeight: 30,
};

const buttonBaseStyle: CSSProperties = {
  minHeight: 30,
  padding: '0 10px',
  borderRadius: 6,
  font: 'inherit',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: 'none',
};

export const solidButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: `1px solid ${motocoreColors.ink}`,
  background: motocoreColors.ink,
  color: '#f8fafc',
};

export const neutralButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: `1px solid ${motocoreColors.border}`,
  background: '#ffffff',
  color: motocoreColors.ink,
};

export const accentButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: `1px solid rgba(37, 99, 235, 0.24)`,
  background: 'rgba(37, 99, 235, 0.08)',
  color: motocoreColors.accentDeep,
};

export const dangerButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: '1px solid rgba(220, 38, 38, 0.22)',
  background: 'rgba(220, 38, 38, 0.06)',
  color: '#b91c1c',
};

export const subtleButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: `1px solid transparent`,
  background: motocoreColors.backgroundAlt,
  color: motocoreColors.muted,
};

export const ghostButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: `1px solid ${motocoreColors.accentSoft}`,
  background: 'transparent',
  color: motocoreColors.accentDeep,
};

export const primaryButtonStyle = solidButtonStyle;
export const secondaryButtonStyle = neutralButtonStyle;

export const pillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 7px',
  borderRadius: 6,
  border: `1px solid ${motocoreColors.border}`,
  background: '#ffffff',
  fontSize: 11,
  fontWeight: 500,
  color: motocoreColors.ink,
};

export const emptyStateStyle: CSSProperties = {
  padding: 10,
  borderRadius: 6,
  border: `1px dashed ${motocoreColors.border}`,
  color: motocoreColors.muted,
  background: '#ffffff',
  lineHeight: 1.4,
  fontSize: 13,
};

export const tableWrapStyle: CSSProperties = {
  overflowX: 'auto',
  border: `1px solid ${motocoreColors.borderStrong}`,
  borderRadius: 8,
  background: '#ffffff',
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.75)`,
};

export const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};

export const tableHeaderCellStyle: CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: motocoreColors.muted,
  borderBottom: `1px solid ${motocoreColors.border}`,
  background: motocoreColors.backgroundAlt,
  whiteSpace: 'nowrap',
};

export const tableCellStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: `1px solid ${motocoreColors.border}`,
  color: motocoreColors.ink,
  verticalAlign: 'top',
};
