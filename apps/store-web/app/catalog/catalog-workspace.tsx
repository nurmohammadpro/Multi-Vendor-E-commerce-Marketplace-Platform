'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Package, ChevronRight, Loader2, Download, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
  neutralButtonStyle,
  pageShellStyle,
  searchButtonStyle,
  subtleButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../merchflow-theme';
import { searchRowStyle, WorkspaceTabs } from '../workspace-responsive';
import { ListPager } from '../list-pager';
import { ProductForm } from './product-form';
import { ProductDetail } from './product-detail';
import { BrandsPanel, CategoriesPanel } from './taxonomy-panels';

type Product = {
  id: string;
  product_code: string;
  name: string;
  name_bn?: string;
  status: string;
  is_trackable: boolean;
  has_variants: boolean;
  variant_mode: string;
  unit?: string;
  created_at: string;
  updated_at: string;
  category_name?: string;
  brand_name?: string;
  sku_count: number;
};

type View = 'list' | 'create' | 'edit' | 'detail';
type CatalogTab = 'products' | 'categories' | 'brands';

export function CatalogWorkspace({ canManageCatalog }: { canManageCatalog: boolean }) {
  const [tab, setTab] = useState<CatalogTab>('products');
  const [view, setView] = useState<View>('list');
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  const fetchProducts = async (p: number, s: string, status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (s.trim()) params.set('search', s.trim());
      if (status) params.set('status', status);
      const res = await fetch(`/api/catalog/products?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        setPagination(data.pagination || { page: p, limit: 20, total: 0 });
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(page, search, statusFilter);
  }, [page, statusFilter]);

  const handleSearch = () => {
    setPage(1);
    fetchProducts(1, search, statusFilter);
  };

  const handleViewProduct = (productId: string) => {
    setSelectedProductId(productId);
    setView('detail');
  };

  const handleEditProduct = (productId: string) => {
    setSelectedProductId(productId);
    setView('edit');
  };

  const handleFormSuccess = () => {
    setView('list');
    setSelectedProductId(undefined);
    fetchProducts(page, search, statusFilter);
  };

  const [importingTemplate, setImportingTemplate] = useState(false);
  const handleImportTemplate = async () => {
    setImportingTemplate(true);
    try {
      const res = await fetch('/api/catalog/starter-template', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || 'Import failed');
      toast.success(`Imported ${data.categoriesCreated ?? 0} categories and ${data.brandsCreated ?? 0} brands`);
      fetchProducts(page, search, statusFilter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportingTemplate(false);
    }
  };

  const [showRevise, setShowRevise] = useState(false);
  const [reviseScope, setReviseScope] = useState<'category' | 'brand' | 'all'>('category');
  const [reviseCategoryId, setReviseCategoryId] = useState('');
  const [reviseBrandId, setReviseBrandId] = useState('');
  const [reviseBasis, setReviseBasis] = useState<'sale' | 'cost'>('sale');
  const [reviseMode, setReviseMode] = useState<'increase' | 'decrease' | 'set'>('increase');
  const [reviseUnit, setReviseUnit] = useState<'amount' | 'percent'>('amount');
  const [reviseValue, setReviseValue] = useState('');
  const [revising, setRevising] = useState(false);
  const [reviseCategories, setReviseCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [reviseBrands, setReviseBrands] = useState<Array<{ id: string; name: string }>>([]);

  const openRevise = async () => {
    setShowRevise((value) => !value);
    if (!reviseCategories.length || !reviseBrands.length) {
      try {
        const [catRes, brandRes] = await Promise.all([
          fetch('/api/catalog/categories?limit=200'),
          fetch('/api/catalog/brands?limit=200'),
        ]);
        if (catRes.ok) setReviseCategories((await catRes.json()).categories ?? []);
        if (brandRes.ok) setReviseBrands((await brandRes.json()).brands ?? []);
      } catch {
        // suggestions are optional
      }
    }
  };

  const applyRevision = async () => {
    if (!Number(reviseValue)) { toast.error('Enter a revision value.'); return; }
    if (reviseScope === 'category' && !reviseCategoryId) { toast.error('Select a category.'); return; }
    if (reviseScope === 'brand' && !reviseBrandId) { toast.error('Select a brand.'); return; }
    setRevising(true);
    try {
      const res = await fetch('/api/catalog/prices/bulk-revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: reviseScope,
          categoryId: reviseScope === 'category' ? reviseCategoryId : undefined,
          brandId: reviseScope === 'brand' ? reviseBrandId : undefined,
          basis: reviseBasis,
          mode: reviseMode,
          unit: reviseUnit,
          value: Number(reviseValue),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || 'Revision failed');
      toast.success(`Updated ${data.updated ?? 0} SKU price(s).`);
      setShowRevise(false);
      setReviseValue('');
      fetchProducts(page, search, statusFilter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revision failed');
    } finally {
      setRevising(false);
    }
  };

  if (view === 'create' || view === 'edit') {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => { setView('list'); setSelectedProductId(undefined); }} style={{ ...tokenMutedStyle, cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit' }}>
            Catalog
          </button>
          <ChevronRight style={{ width: 12, height: 12, color: 'var(--muted-foreground)' }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>{view === 'create' ? 'New Product' : 'Edit Product'}</span>
        </div>
        <ProductForm
          productId={view === 'edit' ? selectedProductId : undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => { setView('list'); setSelectedProductId(undefined); }}
        />
      </section>
    );
  }

  if (view === 'detail' && selectedProductId) {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => { setView('list'); setSelectedProductId(undefined); }} style={{ ...tokenMutedStyle, cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit' }}>
            Catalog
          </button>
          <ChevronRight style={{ width: 12, height: 12, color: 'var(--muted-foreground)' }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Product Detail</span>
        </div>
        <ProductDetail
          productId={selectedProductId}
          onEdit={() => setView('edit')}
          onBack={() => { setView('list'); setSelectedProductId(undefined); }}
        />
      </section>
    );
  }

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 10 }}>
      <WorkspaceTabs
        active={tab}
        onChange={(key) => setTab(key as CatalogTab)}
        tabs={[
          { key: 'products', label: 'Products' },
          { key: 'categories', label: 'Categories' },
          { key: 'brands', label: 'Brands' },
        ]}
      />

      {tab === 'categories' ? <CategoriesPanel canManageCatalog={canManageCatalog} /> : null}
      {tab === 'brands' ? <BrandsPanel canManageCatalog={canManageCatalog} /> : null}

      {tab === 'products' ? (
      <>
      {/* Header */}
      <article style={surfaceCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>Product Catalog</h3>
            <p style={{ ...tokenMutedStyle, marginBottom: 0 }}>{pagination.total} products</p>
          </div>
          {canManageCatalog && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={handleImportTemplate}
                disabled={importingTemplate}
                style={{ ...subtleButtonStyle, opacity: importingTemplate ? 0.6 : 1 }}
              >
                {importingTemplate
                  ? <Loader2 style={{ width: 14, height: 14, marginRight: 4, animation: 'spin 1s linear infinite' }} />
                  : <Download style={{ width: 14, height: 14, marginRight: 4 }} />}
                Import dealership catalog
              </button>
              <button
                onClick={openRevise}
                style={subtleButtonStyle}
              >
                <TrendingUp style={{ width: 14, height: 14, marginRight: 4 }} />
                Revise Rates
              </button>
              <button
                onClick={() => setView('create')}
                style={gray800ButtonStyle}
              >
                <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
                Add Product
              </button>
            </div>
          )}
        </div>
      </article>

      {showRevise ? (
        <article style={surfaceCardStyle}>
          <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Revise Rates</h3>
          <p style={{ margin: '0 0 10px', color: 'var(--muted-foreground)', fontSize: 12 }}>
            Apply a price change to every SKU in a category, a brand, or the whole store. The new price takes effect immediately.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Apply to</span>
              <select value={reviseScope} onChange={(e) => setReviseScope(e.target.value as typeof reviseScope)} style={fieldStyle}>
                <option value="category">Category</option>
                <option value="brand">Brand</option>
                <option value="all">All products</option>
              </select>
            </label>
            {reviseScope === 'category' ? (
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>Category</span>
                <select value={reviseCategoryId} onChange={(e) => setReviseCategoryId(e.target.value)} style={fieldStyle}>
                  <option value="">Select category</option>
                  {reviseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            ) : null}
            {reviseScope === 'brand' ? (
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>Brand</span>
                <select value={reviseBrandId} onChange={(e) => setReviseBrandId(e.target.value)} style={fieldStyle}>
                  <option value="">Select brand</option>
                  {reviseBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            ) : null}
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Price</span>
              <select value={reviseBasis} onChange={(e) => setReviseBasis(e.target.value as typeof reviseBasis)} style={fieldStyle}>
                <option value="sale">Sale price</option>
                <option value="cost">Cost price</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Change</span>
              <select value={reviseMode} onChange={(e) => setReviseMode(e.target.value as typeof reviseMode)} style={fieldStyle}>
                <option value="increase">Increase</option>
                <option value="decrease">Decrease</option>
                <option value="set">Set to</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Unit</span>
              <select value={reviseUnit} onChange={(e) => setReviseUnit(e.target.value as typeof reviseUnit)} style={fieldStyle} disabled={reviseMode === 'set'}>
                <option value="amount">Amount (৳)</option>
                <option value="percent">Percent (%)</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Value</span>
              <input type="number" min="0" value={reviseValue} onChange={(e) => setReviseValue(e.target.value)} style={fieldStyle} placeholder="0.00" />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button onClick={() => setShowRevise(false)} style={neutralButtonStyle}>Cancel</button>
            <button onClick={() => void applyRevision()} style={gray800ButtonStyle} disabled={revising}>{revising ? 'Applying…' : 'Apply revision'}</button>
          </div>
        </article>
      ) : null}

      {/* Filters */}
      <article style={surfaceCardStyle}>
        <div style={{ ...searchRowStyle, gap: 6 }}>
          <div style={{ position: 'relative', flex: 3, minWidth: 0 }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--muted-foreground)' }} />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ ...fieldStyle, width: '100%', paddingLeft: 28 }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ ...fieldStyle, flex: 1, minWidth: 100, maxWidth: 130 }}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button onClick={handleSearch} style={searchButtonStyle} disabled={loading}>Search</button>
        </div>
      </article>

      {/* Product Table */}
      <article style={surfaceCardStyle}>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>Product</th>
                <th style={tableHeaderCellStyle}>Category</th>
                <th style={tableHeaderCellStyle}>Brand</th>
                <th style={tableHeaderCellStyle}>Unit</th>
                <th style={{ ...tableHeaderCellStyle, textAlign: 'center' }}>SKUs</th>
                <th style={{ ...tableHeaderCellStyle, textAlign: 'center' }}>Status</th>
                <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ ...tableCellStyle, textAlign: 'center', padding: '32px 10px' }}>
                    <Loader2 style={{ width: 16, height: 16, margin: '0 auto', animation: 'spin 1s linear infinite', color: 'var(--muted-foreground)' }} />
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} style={emptyStateStyle}>
                    No products found
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr
                    key={product.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleViewProduct(product.id)}
                  >
                    <td style={tableCellStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Package style={{ width: 14, height: 14, color: 'var(--muted-foreground)', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 500 }}>{product.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{product.product_code}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tableCellStyle}>{product.category_name || '—'}</td>
                    <td style={tableCellStyle}>{product.brand_name || '—'}</td>
                    <td style={tableCellStyle}>{product.unit || 'pcs'}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'center' }}>{product.sku_count}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 500,
                        background: product.status === 'active' ? 'var(--success)' : 'var(--muted)',
                        color: product.status === 'active' ? 'var(--success-foreground)' : 'var(--muted-foreground)',
                      }}>
                        {product.status}
                      </span>
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                      {canManageCatalog && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditProduct(product.id); }}
                          style={{ ...subtleButtonStyle, fontSize: 11, padding: '4px 8px' }}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <ListPager
          page={pagination.page}
          pagination={pagination}
          onPrevious={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          label="products"
        />
      )}
      </>
      ) : null}
    </section>
  );
}
