'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  accentButtonStyle,
  dangerButtonStyle,
  emptyStateStyle,
  fieldStyle,
  searchButtonStyle,
  secondaryButtonStyle,
  subtleButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../marketone-theme';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';
import { searchRowStyle, useCompactLayout } from '../workspace-responsive';

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

export function TaxonomyWorkspace({ canManageCatalog }: { canManageCatalog: boolean }) {
  const compact = useCompactLayout();

  // ── Categories state ──
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryPagination, setCategoryPagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });
  const [categoryForm, setCategoryForm] = useState({ code: '', name: '', parentId: '' });
  const [editingCategoryId, setEditingCategoryId] = useState('');

  // ── Brands state ──
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandSearch, setBrandSearch] = useState('');
  const [brandPage, setBrandPage] = useState(1);
  const [brandPagination, setBrandPagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });
  const [brandForm, setBrandForm] = useState({ name: '' });
  const [editingBrandId, setEditingBrandId] = useState('');

  // ── Shared ──
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Categories & brands ready.');
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [brandFormOpen, setBrandFormOpen] = useState(false);

  // Category parent options (only top-level categories)
  const parentOptions = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);

  // ── Refresh ──
  const refresh = async (catPage = categoryPage, brPage = brandPage) => {
    setLoading(true);
    try {
      const catParams = new URLSearchParams({ page: String(catPage), limit: String(categoryPagination.limit) });
      const brParams = new URLSearchParams({ page: String(brPage), limit: String(brandPagination.limit) });
      if (categorySearch.trim()) catParams.set('search', categorySearch.trim());
      if (brandSearch.trim()) brParams.set('search', brandSearch.trim());

      const [catPayload, brPayload] = await Promise.all([
        readJson<{ categories: Category[]; pagination?: PaginationState }>(`/api/catalog/categories?${catParams.toString()}`),
        readJson<{ brands: Brand[]; pagination?: PaginationState }>(`/api/catalog/brands?${brParams.toString()}`),
      ]);

      setCategories(catPayload.categories ?? []);
      setCategoryPagination(catPayload.pagination ?? { page: catPage, limit: categoryPagination.limit, total: catPayload.categories?.length ?? 0 });
      setCategoryPage(catPayload.pagination?.page ?? catPage);

      setBrands(brPayload.brands ?? []);
      setBrandPagination(brPayload.pagination ?? { page: brPage, limit: brandPagination.limit, total: brPayload.brands?.length ?? 0 });
      setBrandPage(brPayload.pagination?.page ?? brPage);

      setMessage(`Categories: ${catPayload.categories?.length ?? 0} · Brands: ${brPayload.brands?.length ?? 0}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(1, 1).catch((error: Error) => setMessage(error.message));
  }, []);

  // ── Category CRUD ──
  const resetCategoryForm = () => {
    setCategoryForm({ code: '', name: '', parentId: '' });
    setEditingCategoryId('');
    setCategoryFormOpen(false);
  };

  const startEditCategory = (cat: Category) => {
    setCategoryForm({ code: cat.code, name: cat.name, parentId: cat.parent_id || '' });
    setEditingCategoryId(cat.id);
    setCategoryFormOpen(true);
  };

  const saveCategory = async () => {
    if (!categoryForm.code || !categoryForm.name) {
      setMessage('Code and name are required.');
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        code: categoryForm.code,
        name: categoryForm.name,
        status: 'active',
      };
      if (categoryForm.parentId) body.parentId = categoryForm.parentId;

      await readJson(editingCategoryId ? `/api/catalog/categories/${editingCategoryId}` : '/api/catalog/categories', {
        method: editingCategoryId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await refresh();
      resetCategoryForm();
      setMessage(editingCategoryId ? '✓ Category updated.' : '✓ Category created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategoryStatus = async (cat: Category) => {
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

  const deleteCategory = async (cat: Category) => {
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

  // ── Brand CRUD ──
  const resetBrandForm = () => {
    setBrandForm({ name: '' });
    setEditingBrandId('');
    setBrandFormOpen(false);
  };

  const startEditBrand = (brand: Brand) => {
    setBrandForm({ name: brand.name });
    setEditingBrandId(brand.id);
    setBrandFormOpen(true);
  };

  const saveBrand = async () => {
    if (!brandForm.name.trim()) {
      setMessage('Brand name is required.');
      return;
    }
    setLoading(true);
    try {
      await readJson(editingBrandId ? `/api/catalog/brands/${editingBrandId}` : '/api/catalog/brands', {
        method: editingBrandId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: brandForm.name.trim(),
          status: 'active',
        }),
      });
      await refresh();
      resetBrandForm();
      setMessage(editingBrandId ? '✓ Brand updated.' : '✓ Brand created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleBrandStatus = async (brand: Brand) => {
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

  const deleteBrand = async (brand: Brand) => {
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

  const statusBadge = (status: string) => ({
    display: 'inline-block' as const,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: status === 'active' ? '#dcfce7' : '#f1f5f9',
    color: status === 'active' ? '#166534' : '#64748b',
  });

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>{message}</p>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* ═══════════ Categories Panel ═══════════ */}
        <article style={surfaceCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Categories</h3>
            {canManageCatalog && !categoryFormOpen ? (
              <button onClick={() => setCategoryFormOpen(true)} style={accentButtonStyle} disabled={loading}>+ New</button>
            ) : null}
          </div>

          {/* Category search */}
          <div style={{ ...searchRowStyle, marginBottom: 10 }}>
            <input
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void refresh(1, brandPage); }}
              style={{ ...fieldStyle, flex: 1 }}
              placeholder="Search categories..."
            />
            <button onClick={() => void refresh(1, brandPage)} style={searchButtonStyle} disabled={loading}>Go</button>
          </div>

          {/* Category create/edit form */}
          {categoryFormOpen ? (
            <div style={{ display: 'grid', gap: 8, marginBottom: 12, padding: 10, background: 'var(--muted)', borderRadius: 8 }}>
              <input
                value={categoryForm.code}
                onChange={(e) => setCategoryForm((c) => ({ ...c, code: e.target.value }))}
                style={fieldStyle}
                placeholder="Code (e.g. TIRE-17)"
              />
              <input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm((c) => ({ ...c, name: e.target.value }))}
                style={fieldStyle}
                placeholder="Name (e.g. 17-inch Tires)"
              />
              <select
                value={categoryForm.parentId}
                onChange={(e) => setCategoryForm((c) => ({ ...c, parentId: e.target.value }))}
                style={fieldStyle}
              >
                <option value="">Top-level category (no parent)</option>
                {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={saveCategory} style={{ ...accentButtonStyle, flex: 1 }} disabled={loading || !categoryForm.code || !categoryForm.name}>
                  {editingCategoryId ? 'Update' : 'Create'}
                </button>
                <button onClick={resetCategoryForm} style={secondaryButtonStyle} disabled={loading}>Cancel</button>
              </div>
            </div>
          ) : null}

          {/* Category list */}
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
                            <button onClick={() => startEditCategory(cat)} style={subtleButtonStyle}>Edit</button>
                            <button onClick={() => void toggleCategoryStatus(cat)} style={subtleButtonStyle}>
                              {cat.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => void deleteCategory(cat)} style={dangerButtonStyle}>Delete</button>
                          </div>
                        ) : <span style={tokenMutedStyle}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>{categorySearch ? 'No categories match this search.' : 'No categories yet.'}</div>
          )}

          <div style={{ marginTop: 8 }}>
            <ListPager
              loading={loading}
              page={categoryPage}
              pagination={categoryPagination}
              label="category(ies)"
              onPrevious={() => void refresh(Math.max(1, categoryPage - 1), brandPage)}
              onNext={() => void refresh(Math.min(totalPagesFor(categoryPagination), categoryPage + 1), brandPage)}
            />
          </div>
        </article>

        {/* ═══════════ Brands Panel ═══════════ */}
        <article style={surfaceCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Brands</h3>
            {canManageCatalog && !brandFormOpen ? (
              <button onClick={() => setBrandFormOpen(true)} style={accentButtonStyle} disabled={loading}>+ New</button>
            ) : null}
          </div>

          {/* Brand search */}
          <div style={{ ...searchRowStyle, marginBottom: 10 }}>
            <input
              value={brandSearch}
              onChange={(e) => setBrandSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void refresh(categoryPage, 1); }}
              style={{ ...fieldStyle, flex: 1 }}
              placeholder="Search brands..."
            />
            <button onClick={() => void refresh(categoryPage, 1)} style={searchButtonStyle} disabled={loading}>Go</button>
          </div>

          {/* Brand create/edit form */}
          {brandFormOpen ? (
            <div style={{ display: 'grid', gap: 8, marginBottom: 12, padding: 10, background: 'var(--muted)', borderRadius: 8 }}>
              <input
                value={brandForm.name}
                onChange={(e) => setBrandForm((c) => ({ ...c, name: e.target.value }))}
                style={fieldStyle}
                placeholder="Brand name"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveBrand(); } }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={saveBrand} style={{ ...accentButtonStyle, flex: 1 }} disabled={loading || !brandForm.name.trim()}>
                  {editingBrandId ? 'Update' : 'Create'}
                </button>
                <button onClick={resetBrandForm} style={secondaryButtonStyle} disabled={loading}>Cancel</button>
              </div>
            </div>
          ) : null}

          {/* Brand list */}
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
                            <button onClick={() => startEditBrand(brand)} style={subtleButtonStyle}>Edit</button>
                            <button onClick={() => void toggleBrandStatus(brand)} style={subtleButtonStyle}>
                              {brand.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => void deleteBrand(brand)} style={dangerButtonStyle}>Delete</button>
                          </div>
                        ) : <span style={tokenMutedStyle}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>{brandSearch ? 'No brands match this search.' : 'No brands yet.'}</div>
          )}

          <div style={{ marginTop: 8 }}>
            <ListPager
              loading={loading}
              page={brandPage}
              pagination={brandPagination}
              label="brand(s)"
              onPrevious={() => void refresh(categoryPage, Math.max(1, brandPage - 1))}
              onNext={() => void refresh(categoryPage, Math.min(totalPagesFor(brandPagination), brandPage + 1))}
            />
          </div>
        </article>

      </div>

      {/* Operator Notes */}
      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
