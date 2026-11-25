'use client';

import { trFor } from '../lib/i18n';

import { useCallback, useEffect, useState } from 'react';

import {
  metricLabelStyle,
  metricValueStyle,
  sectionLabelStyle,
  sectionPanelStyle,
  subtleButtonStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from './merchflow-theme';

type DashboardPayload = {
  range: string;
  profit: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    payroll: number;
    opex: number;
    netProfit: number;
    orders: number;
  };
  cashFlow: { cashIn: number; cashOut: number; netCash: number; cashSales: number };
  position: { receivables: number; payables: number; bankBalance: number; cashInHand: number };
  lowStock: Array<{ productName: string; skuCode: string; availableQty: number; unit: string; threshold: number }>;
};

type Range = 'today' | 'week' | 'month';

const RANGES: Array<{ key: Range; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

const money = (value: number | undefined) =>
  Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (value: number | undefined) => {
  const numeric = Number(value ?? 0);
  return Number.isInteger(numeric) ? String(numeric) : String(numeric).replace(/\.?0+$/, '');
};

function Metric({
  label,
  value,
  emphasis,
  negative,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  negative?: boolean;
}) {
  return (
    <article style={surfaceCardStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div
        style={{
          ...metricValueStyle,
          ...(emphasis ? { color: negative ? '#b91c1c' : '#166534' } : {}),
        }}
      >
        {value}
      </div>
    </article>
  );
}

export function DealerDashboardPanel({ locale = 'en' }: { locale?: 'en' | 'bn' }) {
  const t = trFor(locale);
  const [range, setRange] = useState<Range>('today');
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/inventory/locations')
      .then((r) => r.json())
      .then((payload) => setLocations(payload.locations ?? []))
      .catch(() => setLocations([]));
  }, []);

  const load = useCallback(async (nextRange: Range, nextLocation = '') => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/store-dashboard?range=${nextRange}${nextLocation ? `&locationId=${nextLocation}` : ''}`);
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [locationFilter]);

  useEffect(() => {
    void load(range, locationFilter);
  }, [range, locationFilter, load]);

  const position = data?.position;
  const profit = data?.profit;
  const cash = data?.cashFlow;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {RANGES.map((option) => (
          <button
            key={option.key}
            onClick={() => setRange(option.key)}
            style={{
              ...subtleButtonStyle,
              background: range === option.key ? 'var(--card)' : undefined,
              borderColor: range === option.key ? 'var(--border-strong)' : undefined,
              fontWeight: range === option.key ? 600 : 500,
            }}
          >
            {option.label}
          </button>
        ))}
        {locations.length > 1 ? (
          <select
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            style={{ ...subtleButtonStyle, fontSize: 12, padding: '4px 8px' }}
            aria-label="Outlet"
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        ) : null}
        {loading ? <span style={tokenMutedStyle}>Loading…</span> : null}
        {error ? <span style={{ fontSize: 12, color: '#b91c1c' }}>{error}</span> : null}
      </div>

      <section>
        <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>{t('POSITION')}</div>
        <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Metric label={t('Receivables')} value={`BDT ${money(position?.receivables)}`} />
          <Metric label={t('Payables')} value={`BDT ${money(position?.payables)}`} />
          <Metric label={t('Cash in Hand')} value={`BDT ${money(position?.cashInHand)}`} />
          <Metric label={t('Bank Balance')} value={`BDT ${money(position?.bankBalance)}`} />
        </section>
      </section>

      <section>
        <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>Profit &amp; Loss</div>
        <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Metric label={t('REVENUE')} value={`BDT ${money(profit?.revenue)}`} />
          <Metric label={t('COST OF GOODS')} value={`BDT ${money(profit?.cogs)}`} />
          <Metric label={t('GROSS PROFIT')} value={`BDT ${money(profit?.grossProfit)}`} />
          <Metric label={t('EXPENSES')} value={`BDT ${money(profit?.expenses)}`} />
          <Metric label={t('PAYROLL')} value={`BDT ${money(profit?.payroll)}`} />
          <Metric
            label={t('NET PROFIT')}
            value={`BDT ${money(profit?.netProfit)}`}
            emphasis
            negative={(profit?.netProfit ?? 0) < 0}
          />
        </section>
      </section>

      <section>
        <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>CASH FLOW</div>
        <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Metric label={t('CASH IN')} value={`BDT ${money(cash?.cashIn)}`} />
          <Metric label={t('CASH OUT')} value={`BDT ${money(cash?.cashOut)}`} />
          <Metric
            label={t('NET CASH')}
            value={`BDT ${money(cash?.netCash)}`}
            emphasis
            negative={(cash?.netCash ?? 0) < 0}
          />
        </section>
      </section>

      <section>
        <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>LOW STOCK</div>
        {data?.lowStock?.length ? (
          <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {data.lowStock.map((item) => (
              <article key={item.skuCode} style={surfaceCardStyle}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{item.productName}</div>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{item.skuCode}</div>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <strong>{qty(item.availableQty)} {item.unit}</strong>
                  <span style={{ color: 'var(--muted-foreground)' }}> · reorder at {qty(item.threshold)} {item.unit}</span>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <div style={tokenMutedStyle}>No items are at or below the reorder threshold.</div>
        )}
      </section>
    </div>
  );
}
