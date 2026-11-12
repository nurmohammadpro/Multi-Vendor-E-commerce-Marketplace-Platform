'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  dangerButtonStyle,
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
  searchButtonStyle,
  secondaryButtonStyle,
  subtleButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../merchflow-theme';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';
import { searchRowStyle } from '../workspace-responsive';

type Category = { id: string; parent_id?: string | null; parent_name?: string | null; code: string; name: string; status: string };
type Brand = { id: string; name: string; status: string };

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  }
  return payload as T;
}

function statusBadge(status: string) {
  return {
    display: 'inline-block' as const,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: status === 'active' ? '#dcfce7' : '#f1f5f9',
    color: status === 'active' ? '#166534' : '#64748b',
  };
}

export function CategoriesPanel({ canManageCatalog }: { canManageCatalog: boolean }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });
  const [form, setForm] = useState({ code: '', name: '', parentId: '' });
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const parentOptions = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);

  const refresh = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(pagination.limit) });
      if (search.trim()) params.set('search', search.trim());
      const payload = await readJson<{ categories: Category[]; pagination?: PaginationState }>(`/api/catalog/categories?${params.toString()}`);
      setCategories(payload.categories ?? []);
      setPagination(payload.pagination ?? { page: p, limit: pagination.limit, total: payload.categories?.length ?? 0 });
      setPage(payload.pagination?.page ?? p);
      setMessage(`${payload.categories?.length ?? 0} categor(ies) loaded.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(1).catch((error: Error) => setMessage(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setForm({ code: '', name: '', parentId: '' });
    setEditingCategoryId('');
    setFormOpen(false);
  };

  const save = async () => {
    if (!form.code || !form.name) {
      setMessage('Code and name are required.');
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = { code: form.code, name: form.name, status: 'active' };
      if (form.parentId) body.parentId = form.parentId;
      await readJson(editingCategoryId ? `/api/catalog/categories/${editingCategoryId}` : '/api/catalog/categories', {
        method: editingCategoryId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await refresh();
      resetForm();
      setMessage(editingCategoryId ? '✓ Category updated.' : '✓ Category created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (cat: Category) => {
    try {
      await readJson(`/api/catalog/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: cat.status === 'active' ? 'inactive' : 'active' }),
      });
      await refresh();
      setMessage(`Category "${cat.name}" ${cat.status === 'active' ? 'deactivated' : 'activated'}.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const remove = async (cat: Category) => {
    if (!confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await readJson(`/api/catalog/categories/${cat.id}`, { method: 'DELETE' });
      await refresh();
      setMessage(`✓ Category "${cat.name}" deleted.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <article style={surfaceCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Categories</h3>
        {canManageCatalog && !formOpen ? (
          <button onClick={() => setFormOpen(true)} style={gray800ButtonStyle} disabled={loading}>+ New</button>
        ) : null}
      </div>

      <div style={{ ...searchRowStyle, marginBottom: 10 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void refresh(1); }}
          style={{ ...fieldStyle, flex: 1 }}
          placeholder="Search categories..."
        />
        <button onClick={() => void refresh(1)} style={searchButtonStyle} disabled={loading}>Go</button>
      </div>

      {formOpen ? (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12, padding: 10, background: 'var(--muted)', borderRadius: 8 }}>
          <input
            value={form.code}
            onChange={(e) => setForm((c) => ({ ...c, code: e.target.value }))}
            style={fieldStyle}
            placeholder="Code (e.g. TIRE-17)"
          />
          <input
            value={form.name}
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
            style={fieldStyle}
            placeholder="Name (e.g. 17-inch Tires)"
          />
          <select
            value={form.parentId}
            onChange={(e) => setForm((c) => ({ ...c, parentId: e.target.value }))}
            style={fieldStyle}
          >
            <option value="">Top-level category (no parent)</option>
            {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={save} style={{ ...gray800ButtonStyle, flex: 1 }} disabled={loading || !form.code || !form.name}>
              {editingCategoryId ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm} style={secondaryButtonStyle} disabled={loading}>Cancel</button>
          </div>
        </div>
      ) : null}

      {categories.length ? (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>Code</th>
                <th style={tableHeaderCellStyle}>Name</th>
                <th style={tableHeaderCellStyle}>Parent</th>
                <th style={tableHeaderCellStyle}>Status</th>
                <th style={tableHeaderCellStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td style={{ ...tableCellStyle, fontFamily: 'monospace', fontSize: 11 }}>{cat.code}</td>
                  <td style={{ ...tableCellStyle, fontWeight: 500 }}>{cat.name}</td>
                  <td style={tableCellStyle}>{cat.parent_name || '—'}</td>
                  <td style={tableCellStyle}><span style={statusBadge(cat.status)}>{cat.status}</span></td>
                  <td style={tableCellStyle}>
                    {canManageCatalog ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button onClick={() => { setForm({ code: cat.code, name: cat.name, parentId: cat.parent_id || '' }); setEditingCategoryId(cat.id); setFormOpen(true); }} style={subtleButtonStyle}>Edit</button>
                        <button onClick={() => void toggleStatus(cat)} style={subtleButtonStyle}>
                          {cat.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => void remove(cat)} style={dangerButtonStyle}>Delete</button>
                      </div>
                    ) : <span style={tokenMutedStyle}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={emptyStateStyle}>{search ? 'No categories match this search.' : 'No categories yet.'}</div>
      )}

      <div style={{ marginTop: 8 }}>
        <ListPager
          loading={loading}
          page={page}
          pagination={pagination}
          label="category(ies)"
          onPrevious={() => void refresh(Math.max(1, page - 1))}
          onNext={() => void refresh(Math.min(totalPagesFor(pagination), page + 1))}
        />
      </div>
      {message ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>{message}</p> : null}
    </article>
  );
}

export function BrandsPanel({ canManageCatalog }: { canManageCatalog: boolean }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });
  const [form, setForm] = useState({ name: '' });
  const [editingBrandId, setEditingBrandId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(pagination.limit) });
      if (search.trim()) params.set('search', search.trim());
      const payload = await readJson<{ brands: Brand[]; pagination?: PaginationState }>(`/api/catalog/brands?${params.toString()}`);
      setBrands(payload.brands ?? []);
      setPagination(payload.pagination ?? { page: p, limit: pagination.limit, total: payload.brands?.length ?? 0 });
      setPage(payload.pagination?.page ?? p);
      setMessage(`${payload.brands?.length ?? 0} brand(s) loaded.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(1).catch((error: Error) => setMessage(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setForm({ name: '' });
    setEditingBrandId('');
    setFormOpen(false);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setMessage('Brand name is required.');
      return;
    }
    setLoading(true);
    try {
      await readJson(editingBrandId ? `/api/catalog/brands/${editingBrandId}` : '/api/catalog/brands', {
        method: editingBrandId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), status: 'active' }),
      });
      await refresh();
      resetForm();
      setMessage(editingBrandId ? '✓ Brand updated.' : '✓ Brand created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (brand: Brand) => {
    try {
      await readJson(`/api/catalog/brands/${brand.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: brand.status === 'active' ? 'inactive' : 'active' }),
      });
      await refresh();
      setMessage(`Brand "${brand.name}" ${brand.status === 'active' ? 'deactivated' : 'activated'}.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const remove = async (brand: Brand) => {
    if (!confirm(`Delete brand "${brand.name}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await readJson(`/api/catalog/brands/${brand.id}`, { method: 'DELETE' });
      await refresh();
      setMessage(`✓ Brand "${brand.name}" deleted.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <article style={surfaceCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Brands</h3>
        {canManageCatalog && !formOpen ? (
          <button onClick={() => setFormOpen(true)} style={gray800ButtonStyle} disabled={loading}>+ New</button>
        ) : null}
      </div>

      <div style={{ ...searchRowStyle, marginBottom: 10 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void refresh(1); }}
          style={{ ...fieldStyle, flex: 1 }}
          placeholder="Search brands..."
        />
        <button onClick={() => void refresh(1)} style={searchButtonStyle} disabled={loading}>Go</button>
      </div>

      {formOpen ? (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12, padding: 10, background: 'var(--muted)', borderRadius: 8 }}>
          <input
            data-enter-nav="false"
            value={form.name}
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
            style={fieldStyle}
            placeholder="Brand name"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={save} style={{ ...gray800ButtonStyle, flex: 1 }} disabled={loading || !form.name.trim()}>
              {editingBrandId ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm} style={secondaryButtonStyle} disabled={loading}>Cancel</button>
          </div>
        </div>
      ) : null}

      {brands.length ? (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>Name</th>
                <th style={tableHeaderCellStyle}>Status</th>
                <th style={tableHeaderCellStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <tr key={brand.id}>
                  <td style={{ ...tableCellStyle, fontWeight: 500 }}>{brand.name}</td>
                  <td style={tableCellStyle}><span style={statusBadge(brand.status)}>{brand.status}</span></td>
                  <td style={tableCellStyle}>
                    {canManageCatalog ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button onClick={() => { setForm({ name: brand.name }); setEditingBrandId(brand.id); setFormOpen(true); }} style={subtleButtonStyle}>Edit</button>
                        <button onClick={() => void toggleStatus(brand)} style={subtleButtonStyle}>
                          {brand.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => void remove(brand)} style={dangerButtonStyle}>Delete</button>
                      </div>
                    ) : <span style={tokenMutedStyle}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={emptyStateStyle}>{search ? 'No brands match this search.' : 'No brands yet.'}</div>
      )}

      <div style={{ marginTop: 8 }}>
        <ListPager
          loading={loading}
          page={page}
          pagination={pagination}
          label="brand(s)"
          onPrevious={() => void refresh(Math.max(1, page - 1))}
          onNext={() => void refresh(Math.min(totalPagesFor(pagination), page + 1))}
        />
      </div>
      {message ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>{message}</p> : null}
    </article>
  );
}
