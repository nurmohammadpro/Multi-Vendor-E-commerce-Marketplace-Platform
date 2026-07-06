'use client';

import { useEffect, useState } from 'react';

import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../marketone-theme';

type Location = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  location_type: string;
  status: string;
  created_at: string;
  updated_at: string;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  }
  return payload as T;
}

type WorkspaceProps = {
  canViewInventory: boolean;
  canManageLocations: boolean;
};

export function LocationsWorkspace({ canViewInventory, canManageLocations }: WorkspaceProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [message, setMessage] = useState('Location management ready.');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [form, setForm] = useState({
    code: '',
    name: '',
    address: '',
    phone: '',
    email: '',
  });

  const refresh = async () => {
    const payload = await readJson<{ locations: Location[] }>('/api/inventory/locations');
    setLocations(payload.locations ?? []);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const resetForm = () => {
    setForm({ code: '', name: '', address: '', phone: '', email: '' });
    setEditingId(null);
    setCreateOpen(false);
  };

  const createLocation = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setMessage('Code and name are required.');
      return;
    }
    setLoading(true);
    try {
      await readJson('/api/inventory/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          locationType: 'store',
          address: form.address.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
        }),
      });
      await refresh();
      resetForm();
      setMessage('Location created successfully.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (location: Location) => {
    setForm({
      code: location.code,
      name: location.name,
      address: location.address ?? '',
      phone: location.phone ?? '',
      email: location.email ?? '',
    });
    setEditingId(location.id);
    setCreateOpen(false);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!form.name.trim()) {
      setMessage('Name is required.');
      return;
    }
    setLoading(true);
    try {
      await readJson(`/api/inventory/locations/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          address: form.address.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
        }),
      });
      await refresh();
      resetForm();
      setMessage('Location updated successfully.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const deactivateLocation = async (location: Location) => {
    setLoading(true);
    try {
      await fetch(`/api/inventory/locations/${location.id}`, { method: 'DELETE' });
      await refresh();
      setMessage(`Location "${location.name}" deactivated.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canViewInventory) {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Access limited</h3>
          <p style={tokenMutedStyle}>Your role can&apos;t view location data.</p>
        </article>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      {canManageLocations ? (
        <article style={surfaceCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{createOpen || editingId ? (editingId ? 'Edit Location' : 'New Location') : 'Locations'}</h3>
            {!createOpen && !editingId ? (
              <button onClick={() => setCreateOpen(true)} style={accentButtonStyle} disabled={loading}>+ Add Location</button>
            ) : null}
          </div>

          {createOpen || editingId ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <input
                  value={form.code}
                  onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Code* (e.g. MAIN)"
                  disabled={loading}
                />
                <input
                  value={form.name}
                  onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Name* (e.g. Main Store)"
                  disabled={loading}
                />
              </div>
              <textarea
                value={form.address}
                onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))}
                style={{ ...fieldStyle, minHeight: 72 }}
                placeholder="Address"
                disabled={loading}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Phone"
                  disabled={loading}
                />
                <input
                  value={form.email}
                  onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Email"
                  disabled={loading}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={editingId ? saveEdit : createLocation} style={accentButtonStyle} disabled={loading}>
                  {editingId ? 'Save Changes' : 'Create Location'}
                </button>
                <button onClick={resetForm} style={secondaryButtonStyle} disabled={loading}>Cancel</button>
              </div>
            </div>
          ) : null}
        </article>
      ) : null}

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>All Locations</h3>
        {locations.length ? (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Code</th>
                  <th style={tableHeaderCellStyle}>Name</th>
                  <th style={tableHeaderCellStyle}>Address</th>
                  <th style={tableHeaderCellStyle}>Phone</th>
                  <th style={tableHeaderCellStyle}>Email</th>
                  <th style={tableHeaderCellStyle}>Type</th>
                  <th style={tableHeaderCellStyle}>Status</th>
                  {canManageLocations ? <th style={tableHeaderCellStyle}>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => (
                  <tr key={loc.id}>
                    <td style={tableCellStyle}><strong>{loc.code}</strong></td>
                    <td style={tableCellStyle}>{loc.name}</td>
                    <td style={tableCellStyle}>{loc.address || '—'}</td>
                    <td style={tableCellStyle}>{loc.phone || '—'}</td>
                    <td style={tableCellStyle}>{loc.email || '—'}</td>
                    <td style={tableCellStyle}>{loc.location_type}</td>
                    <td style={tableCellStyle}>{loc.status}</td>
                    {canManageLocations ? (
                      <td style={tableCellStyle}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => startEdit(loc)} style={secondaryButtonStyle} disabled={loading}>Edit</button>
                          {loc.status === 'active' ? (
                            <button onClick={() => deactivateLocation(loc)} style={{ ...secondaryButtonStyle, color: '#dc2626' }} disabled={loading}>Deactivate</button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={emptyStateStyle}>No locations configured yet. Add one to get started.</div>
        )}
      </article>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
