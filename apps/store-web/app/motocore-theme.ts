import type { CSSProperties } from 'react';

export const motocoreColors = {
  background: '#f5f0e7',
  backgroundAlt: '#efe8dc',
  ink: '#1f1a16',
  muted: '#6f685f',
  surface: 'rgba(255, 252, 247, 0.94)',
  surfaceAlt: '#fffdf9',
  surfaceSoft: 'rgba(255, 249, 240, 0.94)',
  border: 'rgba(82, 56, 30, 0.12)',
  accent: '#b45309',
  accentSoft: 'rgba(180, 83, 9, 0.12)',
  accentDeep: '#8a4308',
  shadow: 'rgba(100, 61, 12, 0.08)',
  shadowStrong: 'rgba(100, 61, 12, 0.14)',
};

export const pageShellStyle: CSSProperties = {
  minHeight: '100dvh',
  padding: '24px 18px 36px',
  color: motocoreColors.ink,
  background:
    'radial-gradient(circle at top left, rgba(180, 83, 9, 0.12), transparent 30%), radial-gradient(circle at top right, rgba(120, 53, 15, 0.06), transparent 26%), linear-gradient(180deg, #f8f4ec 0%, #f3efe6 100%)',
  fontFamily:
    'var(--font-geist-sans), Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

export const pageFrameStyle: CSSProperties = {
  maxWidth: 1440,
  margin: '0 auto',
  display: 'grid',
  gap: 18,
};

export const sectionIntroStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  maxWidth: 920,
};

export const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  fontWeight: 800,
  color: motocoreColors.muted,
};

export const pageTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(30px, 3vw, 40px)',
  lineHeight: 1.04,
  letterSpacing: '-0.04em',
  fontFamily: 'ui-serif, Georgia, serif',
  fontWeight: 700,
};

export const pageLeadStyle: CSSProperties = {
  margin: 0,
  maxWidth: 780,
  fontSize: 16,
  lineHeight: 1.65,
  color: motocoreColors.muted,
};

export const surfaceCardStyle: CSSProperties = {
  padding: 18,
  borderRadius: 18,
  background: motocoreColors.surface,
  border: `1px solid ${motocoreColors.border}`,
  boxShadow: `0 18px 48px ${motocoreColors.shadow}`,
  backdropFilter: 'blur(10px)',
};

export const surfaceCardStrongStyle: CSSProperties = {
  ...surfaceCardStyle,
  background: motocoreColors.surfaceSoft,
};

export const compactSurfaceCardStyle: CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: motocoreColors.surfaceAlt,
  border: `1px solid ${motocoreColors.border}`,
};

export const metricLabelStyle: CSSProperties = {
  opacity: 0.72,
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: motocoreColors.muted,
};

export const metricValueStyle: CSSProperties = {
  fontSize: 30,
  lineHeight: 1.05,
  fontWeight: 700,
  letterSpacing: '-0.03em',
  color: motocoreColors.ink,
  fontFamily: 'ui-serif, Georgia, serif',
};

export const metricNoteStyle: CSSProperties = {
  marginBottom: 0,
  opacity: 0.82,
  lineHeight: 1.6,
  color: motocoreColors.muted,
};

export const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 14,
  border: `1px solid ${motocoreColors.border}`,
  background: '#fffdf8',
  color: motocoreColors.ink,
  font: 'inherit',
  outline: 'none',
};

export const primaryButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 12,
  border: `1px solid ${motocoreColors.accent}`,
  background: motocoreColors.accent,
  color: '#fff',
  font: 'inherit',
  fontSize: 14,
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 8px 20px rgba(180, 83, 9, 0.14)',
};

export const secondaryButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 12,
  border: `1px solid ${motocoreColors.border}`,
  background: '#fffdf8',
  color: motocoreColors.ink,
  font: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

export const ghostButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 999,
  border: `1px solid ${motocoreColors.accentSoft}`,
  background: 'transparent',
  color: motocoreColors.accentDeep,
  font: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

export const pillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 10px',
  borderRadius: 999,
  border: `1px solid ${motocoreColors.border}`,
  background: '#fffdf8',
  fontSize: 13,
  fontWeight: 700,
  color: motocoreColors.ink,
};

export const emptyStateStyle: CSSProperties = {
  padding: 16,
  borderRadius: 14,
  border: `1px dashed ${motocoreColors.border}`,
  color: motocoreColors.muted,
  background: 'rgba(255, 253, 248, 0.68)',
  lineHeight: 1.6,
};

