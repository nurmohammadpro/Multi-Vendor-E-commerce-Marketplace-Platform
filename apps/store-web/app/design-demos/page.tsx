import type { CSSProperties } from 'react';

import {
  compactSurfaceCardStyle,
  metricLabelStyle,
  metricNoteStyle,
  metricValueStyle,
  motocoreColors,
  pageFrameStyle,
  pageLeadStyle,
  pageShellStyle,
  pageTitleStyle,
  sectionIntroStyle,
  sectionLabelStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from '../motocore-theme';

type Demo = {
  eyebrow: string;
  name: string;
  note: string;
  accent: string;
};

const demos: Demo[] = [
  {
    eyebrow: 'Token direction',
    name: 'Compact commerce',
    note: 'Blue-only accents, low radius, tighter spacing, and lighter type for calm scan speed.',
    accent: motocoreColors.accent,
  },
  {
    eyebrow: 'Surface direction',
    name: 'Quiet panels',
    note: '1px borders and small shadows replace heavy cards so the UI feels focused, not bulky.',
    accent: '#1d4ed8',
  },
  {
    eyebrow: 'Control direction',
    name: 'Short controls',
    note: 'Inputs and buttons stay small, clear, and aligned to the same compact rhythm everywhere.',
    accent: '#3b82f6',
  },
];

const demoGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 12,
};

const demoCardStyle: CSSProperties = {
  ...surfaceCardStyle,
  display: 'grid',
  gap: 10,
  borderRadius: 8,
  padding: 16,
};

const compactRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
};

export default function DesignDemosPage() {
  return (
    <main style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
      <section style={sectionIntroStyle}>
        <span style={sectionLabelStyle}>Design demos</span>
        <h2 style={pageTitleStyle}>Compact MotoCore-inspired UI, with our blue palette kept intact.</h2>
        <p style={pageLeadStyle}>
          This page now shows the actual direction we wanted: smaller spacing, lighter typography, tighter radii, and
          minimal surfaces instead of the older oversized showcase.
        </p>
        <p style={tokenMutedStyle}>
          The visual language is intentionally restrained so the store app reads like an operator console instead of a
          generic SaaS dashboard.
        </p>
      </section>

      <section style={demoGridStyle}>
        {demos.map((demo) => (
          <article key={demo.name} style={demoCardStyle}>
            <div style={compactRowStyle}>
              <span style={{ ...sectionLabelStyle, color: demo.accent }}>{demo.eyebrow}</span>
              <span style={{ ...metricLabelStyle, color: demo.accent, marginBottom: 0 }}>active</span>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.15, letterSpacing: '-0.03em', fontWeight: 500 }}>
                {demo.name}
              </h3>
              <p style={{ margin: 0, color: '#475569', lineHeight: 1.55 }}>{demo.note}</p>
            </div>
            <div style={compactSurfaceCardStyle}>
              <div style={compactRowStyle}>
                <span style={metricLabelStyle}>Primary action</span>
                <span style={{ ...metricValueStyle, fontSize: 18, color: demo.accent }}>32px</span>
              </div>
              <p style={{ ...metricNoteStyle, marginTop: 6 }}>
                Buttons, inputs, and chips share the same compact height and border radius.
              </p>
            </div>
          </article>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <article style={compactSurfaceCardStyle}>
          <div style={metricLabelStyle}>Radius</div>
          <div style={metricValueStyle}>6–8px</div>
          <p style={metricNoteStyle}>Keeps the interface crisp and controlled.</p>
        </article>
        <article style={compactSurfaceCardStyle}>
          <div style={metricLabelStyle}>Type</div>
          <div style={metricValueStyle}>500–600</div>
          <p style={metricNoteStyle}>Lighter weights reduce visual noise.</p>
        </article>
        <article style={compactSurfaceCardStyle}>
          <div style={metricLabelStyle}>Spacing</div>
          <div style={metricValueStyle}>Tight</div>
          <p style={metricNoteStyle}>Smaller paddings keep the workflow focused.</p>
        </article>
      </section>
    </main>
  );
}
