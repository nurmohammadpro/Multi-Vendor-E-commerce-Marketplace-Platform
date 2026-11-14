'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  dangerButtonStyle,
  fieldStyle,
  gray800ButtonStyle,
  neutralButtonStyle,
  surfaceCardStyle,
  tokenMutedStyle,
} from '../merchflow-theme';

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

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  display: 'block',
  marginBottom: 4,
};

const fieldContainerStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
        <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', color: 'var(--muted-foreground)' }} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
      {error && (
        <div style={{
          borderRadius: 4,
          border: '1px solid var(--destructive)',
          background: 'var(--destructive)',
          color: '#ffffff',
          padding: '6px 10px',
          fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* Basic Info */}
      <article style={surfaceCardStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600 }}>Basic Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <div style={fieldContainerStyle}>
            <label style={labelStyle}>Product Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              style={fieldStyle}
              placeholder="e.g. iPhone 15 Pro Max"
            />
          </div>
          <div style={fieldContainerStyle}>
            <label style={labelStyle}>Bengali Name</label>
            <input
              type="text"
              value={form.nameBn}
              onChange={(e) => setForm({ ...form, nameBn: e.target.value })}
              style={fieldStyle}
              placeholder="Optional Bengali name"
            />
          </div>
          <div style={fieldContainerStyle}>
            <label style={labelStyle}>Category</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              style={fieldStyle}
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={fieldContainerStyle}>
            <label style={labelStyle}>Brand</label>
            <select
              value={form.brandId}
              onChange={(e) => setForm({ ...form, brandId: e.target.value })}
              style={fieldStyle}
            >
              <option value="">Select brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ ...fieldContainerStyle, marginTop: 10 }}>
          <label style={labelStyle}>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            style={{ ...fieldStyle, minHeight: 64, resize: 'vertical' }}
            placeholder="Optional product description"
          />
        </div>
      </article>

      {/* Status & Tracking */}
      <article style={surfaceCardStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600 }}>Status & Tracking</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <div style={fieldContainerStyle}>
            <label style={labelStyle}>Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              style={fieldStyle}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div style={fieldContainerStyle}>
            <label style={labelStyle}>Tracking Profile</label>
            <select
              value={form.trackingProfileId}
              onChange={(e) => setForm({ ...form, trackingProfileId: e.target.value })}
              style={fieldStyle}
            >
              <option value="">No tracking</option>
              {trackingProfiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={fieldContainerStyle}>
            <label style={labelStyle}>Warranty Policy</label>
            <select
              value={form.warrantyPolicyId}
              onChange={(e) => setForm({ ...form, warrantyPolicyId: e.target.value })}
              style={fieldStyle}
            >
              <option value="">No warranty</option>
              {warrantyPolicies.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.isTrackable}
              onChange={(e) => setForm({ ...form, isTrackable: e.target.checked })}
              style={{ width: 16, height: 16 }}
            />
            Trackable (serialized inventory)
          </label>
        </div>
      </article>

      {/* Variant Mode */}
      <article style={surfaceCardStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600 }}>Variants</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {['none', 'single', 'multi'].map((mode) => (
            <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="variantMode"
                value={mode}
                checked={form.variantMode === mode}
                onChange={(e) => setForm({ ...form, variantMode: e.target.value, hasVariants: e.target.value !== 'none' })}
                style={{ width: 16, height: 16 }}
              />
              {mode === 'none' ? 'No Variants' : mode === 'single' ? 'Single Variant' : 'Multiple Variants'}
            </label>
          ))}
        </div>
        {form.hasVariants && (
          <p style={{ ...tokenMutedStyle, marginTop: 12 }}>
            Variant groups and options can be managed after creating the product.
          </p>
        )}
      </article>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          style={neutralButtonStyle}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          style={{
            ...gray800ButtonStyle,
            opacity: saving || !form.name.trim() ? 0.5 : 1,
            cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? <Loader2 style={{ width: 14, height: 14, marginRight: 4, animation: 'spin 1s linear infinite' }} /> : <Save style={{ width: 14, height: 14, marginRight: 4 }} />}
          {isEdit ? 'Save Changes' : 'Create Product'}
        </button>
      </div>
    </form>
  );
}
