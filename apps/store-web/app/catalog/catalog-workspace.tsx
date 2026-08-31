'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Package, ChevronRight, Loader2 } from 'lucide-react';
import {
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
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
import { searchRowStyle } from '../workspace-responsive';
import { ListPager } from '../list-pager';
import { ProductForm } from './product-form';
import { ProductDetail } from './product-detail';

type Product = {
  id: string;
  product_code: string;
  name: string;
  name_bn?: string;
  status: string;
  is_trackable: boolean;
  has_variants: boolean;
  variant_mode: string;
  created_at: string;
  updated_at: string;
  category_name?: string;
  brand_name?: string;
  sku_count: number;
};

type View = 'list' | 'create' | 'edit' | 'detail';

export function CatalogWorkspace({ canManageCatalog }: { canManageCatalog: boolean }) {
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

  if (view === 'create' || view === 'edit') {
    return (
      <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
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
      <section style={{ ...pageShellStyle, display: 'grid', gap: 20 }}>
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
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      {/* Header */}
      <article style={surfaceCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>Product Catalog</h3>
            <p style={{ ...tokenMutedStyle, marginBottom: 0 }}>{pagination.total} products</p>
          </div>
          {canManageCatalog && (
            <button
              onClick={() => setView('create')}
              style={gray800ButtonStyle}
            >
              <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
              Add Product
            </button>
          )}
        </div>
      </article>

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
                <th style={{ ...tableHeaderCellStyle, textAlign: 'center' }}>SKUs</th>
                <th style={{ ...tableHeaderCellStyle, textAlign: 'center' }}>Status</th>
                <th style={{ ...tableHeaderCellStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ ...tableCellStyle, textAlign: 'center', padding: '32px 10px' }}>
                    <Loader2 style={{ width: 16, height: 16, margin: '0 auto', animation: 'spin 1s linear infinite', color: 'var(--muted-foreground)' }} />
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} style={emptyStateStyle}>
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
    </section>
  );
}
