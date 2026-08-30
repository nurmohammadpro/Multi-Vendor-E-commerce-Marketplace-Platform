'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
  pageShellStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from '../merchflow-theme';
import { useCompactLayout, WorkspaceTabs } from '../workspace-responsive';
import { useTheme } from '@mvp/theme';

type StoreProfile = {
  id: string;
  store_code?: string | null;
  name: string;
  name_bn?: string | null;
  logo_url?: string | null;
  address_text?: string | null;
  slug?: string | null;
  phone: string;
  email?: string | null;
  status: string;
};

type StoreSettings = {
  store_id: string;
  timezone: string;
  currency_code: string;
  locale: 'en' | 'bn';
  receipt_footer?: string | null;
  invoice_prefix?: string | null;
  allow_negative_stock: boolean;
  low_stock_threshold_default?: number | null;
  points_per_amount?: number | null;
  silver_threshold?: number | null;
  gold_threshold?: number | null;
  platinum_threshold?: number | null;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message)
        ? ((payload as any).error || (payload as any).message)
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export function SettingsWorkspace({ canManageSettings }: { canManageSettings: boolean }) {
  const compact = useCompactLayout();
  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [message, setMessage] = useState('Store settings are ready.');
  const [loading, setLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    nameBn: '',
    phone: '',
    email: '',
    address: '',
    logoUrl: '',
  });
  const [settingsForm, setSettingsForm] = useState({
    timezone: 'Asia/Dhaka',
    currencyCode: 'BDT',
    locale: 'en' as 'en' | 'bn',
    receiptFooter: '',
    invoicePrefix: '',
    allowNegativeStock: false,
    lowStockThresholdDefault: '',
    pointsPerAmount: '100',
    silverThreshold: '0',
    goldThreshold: '500',
    platinumThreshold: '2000',
  });
  const [activeTab, setActiveTab] = useState<'identity' | 'operations' | 'appearance'>('identity');
  const { theme: currentTheme, setTheme, mode: currentMode, setMode, resolvedMode } = useTheme();

  const THEME_ITEMS: Array<{ id: string; label: string }> = [
    { id: 'slate-pro', label: 'Slate Pro' },
    { id: 'stone-sky', label: 'Stone & Sky' },
    { id: 'emerald-cream', label: 'Emerald & Cream' },
    { id: 'ocean-sand', label: 'Ocean & Sand' },
  ];
  const MODE_ITEMS: Array<{ id: 'light' | 'dark' | 'system'; label: string }> = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'system', label: 'System' },
  ];

  const refresh = async () => {
    const [profilePayload, settingsPayload] = await Promise.all([
      readJson<{ store: StoreProfile }>('/api/store/profile'),
      readJson<{ settings: StoreSettings }>('/api/store/settings'),
    ]);

    const nextProfile = profilePayload.store;
    const nextSettings = settingsPayload.settings;
    setProfile(nextProfile);
    setSettings(nextSettings);
    setProfileForm({
      name: nextProfile?.name ?? '',
      nameBn: nextProfile?.name_bn ?? '',
      phone: nextProfile?.phone ?? '',
      email: nextProfile?.email ?? '',
      address: nextProfile?.address_text ?? '',
      logoUrl: nextProfile?.logo_url ?? '',
    });
    setSettingsForm({
      timezone: nextSettings?.timezone ?? 'Asia/Dhaka',
      currencyCode: nextSettings?.currency_code ?? 'BDT',
      locale: (nextSettings?.locale as 'en' | 'bn') ?? 'en',
      receiptFooter: nextSettings?.receipt_footer ?? '',
      invoicePrefix: nextSettings?.invoice_prefix ?? '',
      allowNegativeStock: Boolean(nextSettings?.allow_negative_stock),
      lowStockThresholdDefault:
        nextSettings?.low_stock_threshold_default === null || nextSettings?.low_stock_threshold_default === undefined
          ? ''
          : String(nextSettings.low_stock_threshold_default),
      pointsPerAmount: String(nextSettings?.points_per_amount ?? 100),
      silverThreshold: String(nextSettings?.silver_threshold ?? 0),
      goldThreshold: String(nextSettings?.gold_threshold ?? 500),
      platinumThreshold: String(nextSettings?.platinum_threshold ?? 2000),
    });
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const dirtyProfile = useMemo(() => {
    if (!profile) return false;
    return (
      profileForm.name !== (profile.name ?? '')
      || profileForm.nameBn !== (profile.name_bn ?? '')
      || profileForm.phone !== (profile.phone ?? '')
      || profileForm.email !== (profile.email ?? '')
      || profileForm.address !== (profile.address_text ?? '')
      || profileForm.logoUrl !== (profile.logo_url ?? '')
    );
  }, [profile, profileForm]);

  const dirtySettings = useMemo(() => {
    if (!settings) return false;
    return (
      settingsForm.timezone !== settings.timezone
      || settingsForm.currencyCode !== settings.currency_code
      || settingsForm.locale !== settings.locale
      || settingsForm.receiptFooter !== (settings.receipt_footer ?? '')
      || settingsForm.invoicePrefix !== (settings.invoice_prefix ?? '')
      || settingsForm.allowNegativeStock !== Boolean(settings.allow_negative_stock)
      || settingsForm.lowStockThresholdDefault
        !== (
          settings.low_stock_threshold_default === null || settings.low_stock_threshold_default === undefined
            ? ''
            : String(settings.low_stock_threshold_default)
        )
      || settingsForm.pointsPerAmount !== String(settings.points_per_amount ?? 100)
      || settingsForm.silverThreshold !== String(settings.silver_threshold ?? 0)
      || settingsForm.goldThreshold !== String(settings.gold_threshold ?? 500)
      || settingsForm.platinumThreshold !== String(settings.platinum_threshold ?? 2000)
    );
  }, [settings, settingsForm]);

  const saveProfile = async () => {
    if (!profileForm.name.trim() || !profileForm.phone.trim()) {
      setMessage('Store name and phone are required.');
      return;
    }

    setLoading(true);
    try {
      await readJson('/api/store/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileForm.name.trim(),
          nameBn: profileForm.nameBn.trim() || null,
          phone: profileForm.phone.trim(),
          email: profileForm.email.trim() || null,
          address: profileForm.address.trim() || null,
          logoUrl: profileForm.logoUrl.trim() || null,
        }),
      });
      await refresh();
      setMessage('Store profile updated.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settingsForm.timezone.trim() || !settingsForm.currencyCode.trim()) {
      setMessage('Timezone and currency are required.');
      return;
    }

    setLoading(true);
    try {
      await readJson('/api/store/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: settingsForm.timezone.trim(),
          currencyCode: settingsForm.currencyCode.trim().toUpperCase(),
          locale: settingsForm.locale,
          receiptFooter: settingsForm.receiptFooter.trim() || null,
          invoicePrefix: settingsForm.invoicePrefix.trim() || null,
          allowNegativeStock: settingsForm.allowNegativeStock,
          lowStockThresholdDefault:
            settingsForm.lowStockThresholdDefault.trim() === ''
              ? null
              : Number(settingsForm.lowStockThresholdDefault),
          pointsPerAmount: Number(settingsForm.pointsPerAmount) || 100,
          silverThreshold: Number(settingsForm.silverThreshold) || 0,
          goldThreshold: Number(settingsForm.goldThreshold) || 500,
          platinumThreshold: Number(settingsForm.platinumThreshold) || 2000,
        }),
      });
      await refresh();
      setMessage('Operational settings updated.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!profile || !settings) {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Loading store settings</h3>
          <p style={tokenMutedStyle}>{message}</p>
        </article>
      </section>
    );
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      {compact ? (
        <WorkspaceTabs
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'identity' | 'operations' | 'appearance')}
          tabs={[
            { key: 'identity', label: 'Identity' },
            { key: 'operations', label: 'Operations' },
            { key: 'appearance', label: 'Appearance' },
          ]}
        />
      ) : null}
      <section style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {!compact || activeTab === 'identity' ? (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Store identity</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={profileForm.name}
              onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
              style={fieldStyle}
              placeholder="Store name"
              disabled={!canManageSettings || loading}
            />
            <input
              value={profileForm.nameBn}
              onChange={(event) => setProfileForm((current) => ({ ...current, nameBn: event.target.value }))}
              style={fieldStyle}
              placeholder="Store name (Bangla)"
              disabled={!canManageSettings || loading}
            />
            <input
              value={profileForm.phone}
              onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
              style={fieldStyle}
              placeholder="Phone"
              disabled={!canManageSettings || loading}
            />
            <input
              value={profileForm.email}
              onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
              style={fieldStyle}
              placeholder="Email"
              disabled={!canManageSettings || loading}
            />
            <textarea
              value={profileForm.address}
              onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))}
              style={{ ...fieldStyle, minHeight: 88 }}
              placeholder="Store address"
              disabled={!canManageSettings || loading}
            />
            <textarea
              value={profileForm.logoUrl}
              onChange={(event) => setProfileForm((current) => ({ ...current, logoUrl: event.target.value }))}
              style={{ ...fieldStyle, minHeight: 76 }}
              placeholder="Store logo URL or image data URL"
              disabled={!canManageSettings || loading}
            />
            {profileForm.logoUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={profileForm.logoUrl}
                  alt={`${profileForm.name || 'Store'} logo preview`}
                  style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', padding: 6 }}
                />
                <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Logo preview</div>
              </div>
            ) : (
              <div style={emptyStateStyle}>No store logo saved yet.</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => void saveProfile()}
                style={gray800ButtonStyle}
                disabled={!canManageSettings || loading || !dirtyProfile}
              >
                Save identity
              </button>
              <button
                onClick={() => void refresh()}
                style={secondaryButtonStyle}
                disabled={loading}
              >
                Reset
              </button>
            </div>
          </div>
        </article>
        ) : null}

        {!compact || activeTab === 'operations' ? (
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Operational defaults</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={settingsForm.timezone}
              onChange={(event) => setSettingsForm((current) => ({ ...current, timezone: event.target.value }))}
              style={fieldStyle}
              placeholder="Timezone"
              disabled={!canManageSettings || loading}
            />
            <input
              value={settingsForm.currencyCode}
              onChange={(event) => setSettingsForm((current) => ({ ...current, currencyCode: event.target.value }))}
              style={fieldStyle}
              placeholder="Currency code"
              disabled={!canManageSettings || loading}
            />
            <select
              value={settingsForm.locale}
              onChange={(event) => setSettingsForm((current) => ({ ...current, locale: event.target.value as 'en' | 'bn' }))}
              style={fieldStyle}
              disabled={!canManageSettings || loading}
            >
              <option value="en">English</option>
              <option value="bn">Bangla</option>
            </select>
            <input
              value={settingsForm.invoicePrefix}
              onChange={(event) => setSettingsForm((current) => ({ ...current, invoicePrefix: event.target.value }))}
              style={fieldStyle}
              placeholder="Invoice prefix"
              disabled={!canManageSettings || loading}
            />
            <textarea
              value={settingsForm.receiptFooter}
              onChange={(event) => setSettingsForm((current) => ({ ...current, receiptFooter: event.target.value }))}
              style={{ ...fieldStyle, minHeight: 88 }}
              placeholder="Receipt footer"
              disabled={!canManageSettings || loading}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--foreground)', fontSize: 14 }}>
              <input
                type="checkbox"
                checked={settingsForm.allowNegativeStock}
                onChange={(event) => setSettingsForm((current) => ({ ...current, allowNegativeStock: event.target.checked }))}
                disabled={!canManageSettings || loading}
              />
              Allow negative stock
            </label>
            <input
              value={settingsForm.lowStockThresholdDefault}
              onChange={(event) => setSettingsForm((current) => ({ ...current, lowStockThresholdDefault: event.target.value }))}
              style={fieldStyle}
              placeholder="Low stock threshold"
              disabled={!canManageSettings || loading}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => void saveSettings()}
                style={gray800ButtonStyle}
                disabled={!canManageSettings || loading || !dirtySettings}
              >
                Save settings
              </button>
              <button
                onClick={() => void refresh()}
                style={secondaryButtonStyle}
                disabled={loading}
              >
                Reset
              </button>
            </div>
          </div>
        </article>
        ) : null}
      </section>

      {!compact || activeTab === 'operations' ? (
      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Customer Loyalty</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500 }}>Points earning rate (per BDT)</label>
            <input
              value={settingsForm.pointsPerAmount}
              onChange={(event) => setSettingsForm((current) => ({ ...current, pointsPerAmount: event.target.value }))}
              style={fieldStyle}
              placeholder="100"
              disabled={!canManageSettings || loading}
            />
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>Customer earns 1 point for every X BDT spent. Default: 100</div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500 }}>Silver threshold (points)</label>
            <input
              value={settingsForm.silverThreshold}
              onChange={(event) => setSettingsForm((current) => ({ ...current, silverThreshold: event.target.value }))}
              style={fieldStyle}
              placeholder="0"
              disabled={!canManageSettings || loading}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500 }}>Gold threshold (points)</label>
            <input
              value={settingsForm.goldThreshold}
              onChange={(event) => setSettingsForm((current) => ({ ...current, goldThreshold: event.target.value }))}
              style={fieldStyle}
              placeholder="500"
              disabled={!canManageSettings || loading}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500 }}>Platinum threshold (points)</label>
            <input
              value={settingsForm.platinumThreshold}
              onChange={(event) => setSettingsForm((current) => ({ ...current, platinumThreshold: event.target.value }))}
              style={fieldStyle}
              placeholder="2000"
              disabled={!canManageSettings || loading}
            />
          </div>
        </div>
      </article>
      ) : null}

      {!compact || activeTab === 'appearance' ? (
      <section style={{ display: 'grid', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Theme</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {THEME_ITEMS.map((t) => {
              const active = currentTheme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTheme(t.id as any); }}
                  className="flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors"
                  style={{
                    color: active ? 'var(--accent-foreground)' : 'var(--foreground)',
                    backgroundColor: active ? 'var(--accent)' : 'transparent',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'var(--muted)'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <span>{t.label}</span>
                  {active ? <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-foreground)' }}>Active</span> : null}
                </button>
              );
            })}
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Mode</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {MODE_ITEMS.map((m) => {
              const active = currentMode === m.id;
              const subtitle = m.id === 'system' ? `Using ${resolvedMode === 'light' ? 'Light' : 'Dark'}` : active ? 'Active' : '';
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setMode(m.id); }}
                  className="flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors"
                  style={{
                    color: active ? 'var(--accent-foreground)' : 'var(--foreground)',
                    backgroundColor: active ? 'var(--accent)' : 'transparent',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'var(--muted)'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <span>{m.label}</span>
                  {subtitle ? <span style={{ fontSize: 10, color: active ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }}>{subtitle}</span> : null}
                </button>
              );
            })}
          </div>
        </article>
      </section>
      ) : null}

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Current live configuration</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div><strong>Status:</strong> {profile.status}</div>
          <div><strong>Store code:</strong> {profile.store_code || '—'}</div>
          <div><strong>Slug:</strong> {profile.slug || '—'}</div>
          <div><strong>Timezone:</strong> {settings.timezone}</div>
          <div><strong>Currency:</strong> {settings.currency_code}</div>
          <div><strong>Locale:</strong> {settings.locale}</div>
          <div><strong>Invoice prefix:</strong> {settings.invoice_prefix || '—'}</div>
          <div><strong>Low stock threshold:</strong> {settings.low_stock_threshold_default ?? '—'}</div>
          <div><strong>Negative stock:</strong> {settings.allow_negative_stock ? 'Allowed' : 'Blocked'}</div>
          <div><strong>Points per:</strong> BDT {settings.points_per_amount ?? 100}</div>
          <div><strong>Silver:</strong> {settings.silver_threshold ?? 0} pts</div>
          <div><strong>Gold:</strong> {settings.gold_threshold ?? 500} pts</div>
          <div><strong>Platinum:</strong> {settings.platinum_threshold ?? 2000} pts</div>
        </div>
        <p style={{ marginTop: 14, marginBottom: 0, color: 'var(--muted-foreground)' }}>{message}</p>
      </article>
    </section>
  );
}
