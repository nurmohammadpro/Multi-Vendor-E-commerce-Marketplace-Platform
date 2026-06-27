import type { CSSProperties } from 'react';

export const motocoreColors = {
  background: '#f8fafc',
  backgroundAlt: '#f1f5f9',
  ink: '#0f172a',
  muted: '#475569',
  surface: 'rgba(255, 255, 255, 0.95)',
  surfaceAlt: '#ffffff',
  surfaceSoft: 'rgba(248, 250, 252, 0.96)',
  border: 'rgba(148, 163, 184, 0.22)',
  accent: '#2563eb',
  accentSoft: 'rgba(37, 99, 235, 0.12)',
  accentDeep: '#1d4ed8',
  shadow: 'rgba(15, 23, 42, 0.04)',
  shadowStrong: 'rgba(15, 23, 42, 0.08)',
};

export const pageShellStyle: CSSProperties = {
  minHeight: '100dvh',
  padding: '20px 16px 28px',
  color: motocoreColors.ink,
  background:
    'radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 28%), radial-gradient(circle at top right, rgba(37, 99, 235, 0.04), transparent 24%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
  fontFamily:
    'var(--font-geist-sans), Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

export const pageFrameStyle: CSSProperties = {
  maxWidth: 1280,
  margin: '0 auto',
  display: 'grid',
  gap: 14,
};

export const sectionIntroStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  maxWidth: 760,
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
  fontSize: 14,
  lineHeight: 1.55,
  color: motocoreColors.muted,
};

export const surfaceCardStyle: CSSProperties = {
  padding: 16,
  borderRadius: 8,
  background: motocoreColors.surface,
  border: `1px solid ${motocoreColors.border}`,
  boxShadow: `0 1px 2px ${motocoreColors.shadow}`,
};

export const surfaceCardStrongStyle: CSSProperties = {
  ...surfaceCardStyle,
  background: motocoreColors.surfaceSoft,
};

export const compactSurfaceCardStyle: CSSProperties = {
  padding: 12,
  borderRadius: 6,
  background: motocoreColors.surfaceAlt,
  border: `1px solid ${motocoreColors.border}`,
};

export const metricLabelStyle: CSSProperties = {
  opacity: 1,
  marginBottom: 4,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: motocoreColors.muted,
};

export const metricValueStyle: CSSProperties = {
  fontSize: 24,
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
  lineHeight: 1.55,
  color: motocoreColors.muted,
};

export const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: `1px solid ${motocoreColors.border}`,
  background: '#ffffff',
  color: motocoreColors.ink,
  font: 'inherit',
  outline: 'none',
  minHeight: 32,
};

export const primaryButtonStyle: CSSProperties = {
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 6,
  border: `1px solid ${motocoreColors.accent}`,
  background: motocoreColors.accent,
  color: '#fff',
  font: 'inherit',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: 'none',
};

export const secondaryButtonStyle: CSSProperties = {
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 6,
  border: `1px solid ${motocoreColors.border}`,
  background: '#ffffff',
  color: motocoreColors.ink,
  font: 'inherit',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

export const ghostButtonStyle: CSSProperties = {
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 6,
  border: `1px solid ${motocoreColors.accentSoft}`,
  background: 'transparent',
  color: motocoreColors.accentDeep,
  font: 'inherit',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

export const pillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 6,
  border: `1px solid ${motocoreColors.border}`,
  background: '#ffffff',
  fontSize: 12,
  fontWeight: 500,
  color: motocoreColors.ink,
};

export const emptyStateStyle: CSSProperties = {
  padding: 12,
  borderRadius: 6,
  border: `1px dashed ${motocoreColors.border}`,
  color: motocoreColors.muted,
  background: 'rgba(255, 255, 255, 0.72)',
  lineHeight: 1.5,
};
