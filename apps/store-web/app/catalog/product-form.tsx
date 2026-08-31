'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';

type Category = { id: string; name: string; code: string };
type Brand = { id: string; name: string };
type TrackingProfile = { id: string; name: string; fields: any[] };
type WarrantyPolicy = { id: string; name: string };

type ProductFormData = {
  name: string;
  nameBn: string;
  description: string;
  categoryId: string;
  brandId: string;
  status: string;
  isTrackable: boolean;
  hasVariants: boolean;
  variantMode: string;
  trackingProfileId: string;
  warrantyPolicyId: string;
};

export function ProductForm({
  productId,
  onSuccess,
  onCancel,
}: {
  productId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!productId;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [trackingProfiles, setTrackingProfiles] = useState<TrackingProfile[]>([]);
  const [warrantyPolicies, setWarrantyPolicies] = useState<WarrantyPolicy[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ProductFormData>({
    name: '',
    nameBn: '',
    description: '',
    categoryId: '',
    brandId: '',
    status: 'active',
    isTrackable: true,
    hasVariants: false,
    variantMode: 'none',
    trackingProfileId: '',
    warrantyPolicyId: '',
  });

  useEffect(() => {
    const loadDropdowns = async () => {
      setLoading(true);
      try {
        const [catRes, brandRes, profileRes, warrantyRes] = await Promise.all([
          fetch('/api/catalog/categories?limit=200'),
          fetch('/api/catalog/brands?limit=200'),
          fetch('/api/catalog/tracking-profiles'),
          fetch('/api/v1/warranty/policies'),
        ]);
        if (catRes.ok) {
          const data = await catRes.json();
          setCategories(data.categories || []);
        }
        if (brandRes.ok) {
          const data = await brandRes.json();
          setBrands(data.brands || []);
        }
        if (profileRes.ok) {
          const data = await profileRes.json();
          setTrackingProfiles(data || []);
        }
        if (warrantyRes.ok) {
          const data = await warrantyRes.json();
          setWarrantyPolicies(data.policies || data || []);
        }
      } finally {
        setLoading(false);
      }
    };
    loadDropdowns();
  }, []);

  useEffect(() => {
    if (isEdit && productId) {
      const loadProduct = async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/catalog/products/${productId}`);
          if (res.ok) {
            const data = await res.json();
            const p = data.product;
            setForm({
              name: p.name || '',
              nameBn: p.name_bn || '',
              description: p.description || '',
              categoryId: p.category_id || '',
              brandId: p.brand_id || '',
              status: p.status || 'active',
              isTrackable: p.is_trackable ?? true,
              hasVariants: p.has_variants ?? false,
              variantMode: p.variant_mode || 'none',
              trackingProfileId: data.trackingProfile?.id || '',
              warrantyPolicyId: '',
            });
          }
        } finally {
          setLoading(false);
        }
      };
      loadProduct();
    }
  }, [isEdit, productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        productCode: form.name.substring(0, 30).toLowerCase().replace(/\s+/g, '-'),
        name: form.name,
        nameBn: form.nameBn || undefined,
        description: form.description || undefined,
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
        status: form.status,
        isTrackable: form.isTrackable,
        hasVariants: form.hasVariants,
        variantMode: form.variantMode,
      };

      const url = isEdit ? `/api/catalog/products/${productId}` : '/api/catalog/products';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to save product' }));
        throw new Error(err.message || 'Failed to save product');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <div className="rounded-md border bg-card p-4 space-y-4">
        <h3 className="text-sm font-medium">Basic Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Product Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              placeholder="e.g. iPhone 15 Pro Max"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Bengali Name</label>
            <input
              type="text"
              value={form.nameBn}
              onChange={(e) => setForm({ ...form, nameBn: e.target.value })}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              placeholder="Optional Bengali name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Category</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Brand</label>
            <select
              value={form.brandId}
              onChange={(e) => setForm({ ...form, brandId: e.target.value })}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="">Select brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            placeholder="Optional product description"
          />
        </div>
      </div>

      {/* Status & Tracking */}
      <div className="rounded-md border bg-card p-4 space-y-4">
        <h3 className="text-sm font-medium">Status & Tracking</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Tracking Profile</label>
            <select
              value={form.trackingProfileId}
              onChange={(e) => setForm({ ...form, trackingProfileId: e.target.value })}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="">No tracking</option>
              {trackingProfiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Warranty Policy</label>
            <select
              value={form.warrantyPolicyId}
              onChange={(e) => setForm({ ...form, warrantyPolicyId: e.target.value })}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="">No warranty</option>
              {warrantyPolicies.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isTrackable}
              onChange={(e) => setForm({ ...form, isTrackable: e.target.checked })}
              className="size-4 rounded border-input"
            />
            Trackable (serialized inventory)
          </label>
        </div>
      </div>

      {/* Variant Mode */}
      <div className="rounded-md border bg-card p-4 space-y-4">
        <h3 className="text-sm font-medium">Variants</h3>
        <div className="flex items-center gap-4">
          {['none', 'single', 'multi'].map((mode) => (
            <label key={mode} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="variantMode"
                value={mode}
                checked={form.variantMode === mode}
                onChange={(e) => setForm({ ...form, variantMode: e.target.value, hasVariants: e.target.value !== 'none' })}
                className="size-4"
              />
              {mode === 'none' ? 'No Variants' : mode === 'single' ? 'Single Variant' : 'Multiple Variants'}
            </label>
          ))}
        </div>
        {form.hasVariants && (
          <p className="text-xs text-muted-foreground">
            Variant groups and options can be managed after creating the product.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-md border bg-transparent px-4 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="inline-flex items-center gap-2 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {isEdit ? 'Save Changes' : 'Create Product'}
        </button>
      </div>
    </form>
  );
}
