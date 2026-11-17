'use client';

import { trFor } from '../lib/i18n';

import { useCallback, useEffect, useState } from 'react';

import {
  metricLabelStyle,
  metricNoteStyle,
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
  note,
  emphasis,
  negative,
}: {
  label: string;
  value: string;
  note?: string;
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
      {note ? <div style={metricNoteStyle}>{note}</div> : null}
    </article>
  );
}

export function DealerDashboardPanel({ locale = 'en' }: { locale?: 'en' | 'bn' }) {
  const t = trFor(locale);
  const [range, setRange] = useState<Range>('today');
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextRange: Range) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/store-dashboard?range=${nextRange}`);
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

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
        {loading ? <span style={tokenMutedStyle}>Loading…</span> : null}
        {error ? <span style={{ fontSize: 12, color: '#b91c1c' }}>{error}</span> : null}
      </div>

      <section>
        <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>{t('POSITION')}</div>
        <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Metric label={t('Receivables')} value={`BDT ${money(position?.receivables)}`} note={t('owed by customers')} />
          <Metric label={t('Payables')} value={`BDT ${money(position?.payables)}`} note={t('owed to suppliers')} />
          <Metric label={t('Cash in Hand')} value={`BDT ${money(position?.cashInHand)}`} note={t('cash sales − expenses')} />
          <Metric label={t('Bank Balance')} value={`BDT ${money(position?.bankBalance)}`} note={t('active accounts')} />
        </section>
      </section>

      <section>
        <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>Profit &amp; Loss</div>
        <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Metric label={t('REVENUE')} value={`BDT ${money(profit?.revenue)}`} note={`${profit?.orders ?? 0} ${t('orders')}`} />
          <Metric label={t('COST OF GOODS')} value={`BDT ${money(profit?.cogs)}`} note={t('FIFO costing')} />
          <Metric label={t('GROSS PROFIT')} value={`BDT ${money(profit?.grossProfit)}`} />
          <Metric label={t('EXPENSES')} value={`BDT ${money(profit?.expenses)}`} note={t('daily expenses')} />
          <Metric label={t('PAYROLL')} value={`BDT ${money(profit?.payroll)}`} note={t('paid this period')} />
          <Metric
            label={t('NET PROFIT')}
            value={`BDT ${money(profit?.netProfit)}`}
            note="gross profit − opex"
            emphasis
            negative={(profit?.netProfit ?? 0) < 0}
          />
        </section>
      </section>

      <section>
        <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>CASH FLOW</div>
        <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Metric label={t('CASH IN')} value={`BDT ${money(cash?.cashIn)}`} note={t('collections')} />
          <Metric label={t('CASH OUT')} value={`BDT ${money(cash?.cashOut)}`} note={t('purchases + expenses + payroll')} />
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
