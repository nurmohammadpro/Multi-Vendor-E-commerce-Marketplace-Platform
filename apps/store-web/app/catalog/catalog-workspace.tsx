'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Package, ChevronRight, Loader2 } from 'lucide-react';
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
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => { setView('list'); setSelectedProductId(undefined); }} className="text-sm text-muted-foreground hover:text-foreground">
            Catalog
          </button>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="text-sm font-medium">{view === 'create' ? 'New Product' : 'Edit Product'}</span>
        </div>
        <ProductForm
          productId={view === 'edit' ? selectedProductId : undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => { setView('list'); setSelectedProductId(undefined); }}
        />
      </div>
    );
  }

  if (view === 'detail' && selectedProductId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => { setView('list'); setSelectedProductId(undefined); }} className="text-sm text-muted-foreground hover:text-foreground">
            Catalog
          </button>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="text-sm font-medium">Product Detail</span>
        </div>
        <ProductDetail
          productId={selectedProductId}
          onEdit={() => setView('edit')}
          onBack={() => { setView('list'); setSelectedProductId(undefined); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Product Catalog</h1>
          <p className="text-xs text-muted-foreground">{pagination.total} products</p>
        </div>
        {canManageCatalog && (
          <button
            onClick={() => setView('create')}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" />
            Add Product
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="h-9 w-full rounded-md border bg-transparent pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Product Table */}
      <div className="rounded-md border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Brand</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">SKUs</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No products found
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => handleViewProduct(product.id)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Package className="size-4 text-muted-foreground shrink-0" />
                        <div>
                          <div className="font-medium">{product.name}</div>
                          <div className="text-xs text-muted-foreground">{product.product_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{product.category_name || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{product.brand_name || '—'}</td>
                    <td className="px-3 py-2 text-center">{product.sku_count}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                        product.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canManageCatalog && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditProduct(product.id); }}
                          className="text-xs text-muted-foreground hover:text-foreground"
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
      </div>

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
    </div>
  );
}
