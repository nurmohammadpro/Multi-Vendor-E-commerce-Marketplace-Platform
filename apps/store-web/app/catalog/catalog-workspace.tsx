'use client';

import { useEffect, useMemo, useState } from 'react';

import { emptyStateStyle, fieldStyle, secondaryButtonStyle, surfaceCardStyle, tokenMutedStyle } from '../motocore-theme';

type Category = { id: string; code: string; name: string; status: string };
type Brand = { id: string; name: string; status: string };
type Product = {
  id: string;
  product_code: string;
  name: string;
  status: string;
  has_variants: boolean;
  variant_mode: string;
  category_name?: string | null;
  brand_name?: string | null;
  sku_count: number;
};
type VariantOption = {
  id: string;
  code: string;
  label: string;
  valueText?: string | null;
  valueNumber?: number | null;
  colorHex?: string | null;
  sortOrder: number;
  status: string;
};
type VariantGroup = {
  id: string;
  code: string;
  name: string;
  input_type: string;
  sort_order: number;
  is_required: boolean;
  status: string;
  options: VariantOption[];
};
type ProductDetail = {
  product: {
    id: string;
    product_code: string;
    name: string;
    description?: string | null;
    status: string;
    has_variants: boolean;
    variant_mode: string;
    category_id?: string | null;
    brand_id?: string | null;
  };
  groups: VariantGroup[];
  skus: Array<{
    id: string;
    sku_code: string;
    barcode?: string | null;
    variant_label?: string | null;
    variant_json?: Record<string, unknown> | null;
    status: string;
    sale_price?: string | number | null;
    on_hand_qty?: string | number | null;
    available_qty?: string | number | null;
  }>;
};

type VariantMatrixRow = {
  key: string;
  skuCode: string;
  barcode: string;
  variantLabel: string;
  variantOptionIds: string[];
  salePrice: string;
  costPrice: string;
  compareAtPrice: string;
};

const cardStyle = surfaceCardStyle;
const inputStyle = fieldStyle;
const buttonStyle = secondaryButtonStyle;

const sanitizeSkuToken = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const buildVariantCombinations = (groups: VariantGroup[], selectionMap: Record<string, string[]>) => {
  const selectedGroups = groups
    .map((group) => {
      const selectedIds = selectionMap[group.id] !== undefined
        ? selectionMap[group.id]
        : group.options.map((option) => option.id);
      return {
        group,
        options: group.options.filter((option) => selectedIds.includes(option.id)),
      };
    })
    .filter((entry) => entry.options.length > 0);

  if (selectedGroups.length === 0) {
    return [];
  }

  return selectedGroups.reduce<Array<Array<{ group: VariantGroup; option: VariantOption }>>>(
    (accumulator, entry) => {
      if (accumulator.length === 0) {
        return entry.options.map((option) => [{ group: entry.group, option }]);
      }

      const next: Array<Array<{ group: VariantGroup; option: VariantOption }>> = [];
      for (const combo of accumulator) {
        for (const option of entry.options) {
          next.push([...combo, { group: entry.group, option }]);
        }
      }
      return next;
    },
    [],
  );
};

const buildVariantSkuCode = (baseCode: string, combo: Array<{ group: VariantGroup; option: VariantOption }>) => {
  const suffix = combo.map((entry) => entry.option.code || entry.option.label).join('-');
  return sanitizeSkuToken([baseCode, suffix].filter(Boolean).join('-')).slice(0, 80);
};

const buildVariantLabel = (combo: Array<{ group: VariantGroup; option: VariantOption }>) =>
  combo.map((entry) => `${entry.group.name}: ${entry.option.label}`).join(' / ');

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function CatalogWorkspace({ canManageCatalog }: { canManageCatalog: boolean }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Catalog workspace is ready.');

  const [categoryForm, setCategoryForm] = useState({ code: '', name: '' });
  const [brandForm, setBrandForm] = useState({ name: '' });
  const [productForm, setProductForm] = useState({
    productCode: '',
    name: '',
    description: '',
    categoryId: '',
    brandId: '',
    hasVariants: false,
    variantMode: 'none',
  });
  const [groupForm, setGroupForm] = useState({
    code: '',
    name: '',
    inputType: 'text',
  });
  const [optionForm, setOptionForm] = useState({
    variantGroupId: '',
    code: '',
    label: '',
    valueText: '',
    colorHex: '',
  });
  const [skuForm, setSkuForm] = useState({
    skuCode: '',
    barcode: '',
    unitName: '',
    weightValue: '',
    weightUnit: '',
    variantOptionIds: [] as string[],
  });
  const [priceForm, setPriceForm] = useState({
    skuId: '',
    costPrice: '',
    salePrice: '',
    compareAtPrice: '',
  });
  const [variantSelection, setVariantSelection] = useState<Record<string, string[]>>({});
  const [variantRows, setVariantRows] = useState<VariantMatrixRow[]>([]);
  const [variantPricing, setVariantPricing] = useState({
    baseSalePrice: '',
    priceStep: '',
  });

  const variantOptionsFlat = useMemo(
    () =>
      (productDetail?.groups ?? []).flatMap((group) =>
        (group.options ?? []).map((option) => ({
          ...option,
          groupName: group.name,
        })),
      ),
    [productDetail],
  );

  const refreshBase = async () => {
    const [categoryPayload, brandPayload, productPayload] = await Promise.all([
      readJson<{ categories: Category[] }>('/api/catalog/categories'),
      readJson<{ brands: Brand[] }>('/api/catalog/brands'),
      readJson<{ products: Product[] }>('/api/catalog/products'),
    ]);
    setCategories(categoryPayload.categories ?? []);
    setBrands(brandPayload.brands ?? []);
    setProducts(productPayload.products ?? []);
  };

  const refreshDetail = async (productId = selectedProductId) => {
    if (!productId) {
      setProductDetail(null);
      return;
    }
    const payload = await readJson<ProductDetail>(`/api/catalog/products/${productId}`);
    setProductDetail(payload);
  };

  useEffect(() => {
    void refreshBase().catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (selectedProductId) {
      void refreshDetail(selectedProductId).catch((error: Error) => setMessage(error.message));
    }
  }, [selectedProductId]);

  useEffect(() => {
    if (!productDetail) {
      setVariantSelection({});
      setVariantRows([]);
      setVariantPricing({ baseSalePrice: '', priceStep: '' });
      return;
    }

    setVariantSelection((current) => {
      const next: Record<string, string[]> = {};
      for (const group of productDetail.groups) {
        const selectedIds = current[group.id] !== undefined
          ? current[group.id]
          : group.options.map((option) => option.id);
        next[group.id] = selectedIds.filter((optionId) =>
          group.options.some((option) => option.id === optionId),
        );
      }
      return next;
    });

    setVariantPricing((current) => ({
      baseSalePrice: current.baseSalePrice || String(productDetail.skus[0]?.sale_price ?? ''),
      priceStep: current.priceStep,
    }));
  }, [productDetail]);

  const createCategory = async () => {
    if (!categoryForm.code || !categoryForm.name) return;
    setLoading(true);
    try {
      await readJson('/api/catalog/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: categoryForm.code,
          name: categoryForm.name,
          status: 'active',
          sortOrder: 0,
        }),
      });
      await refreshBase();
      setCategoryForm({ code: '', name: '' });
      setMessage('Category created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const createBrand = async () => {
    if (!brandForm.name) return;
    setLoading(true);
    try {
      await readJson('/api/catalog/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: brandForm.name,
          status: 'active',
        }),
      });
      await refreshBase();
      setBrandForm({ name: '' });
      setMessage('Brand created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const createProduct = async () => {
    if (!productForm.productCode || !productForm.name) return;
    setLoading(true);
    try {
      await readJson('/api/catalog/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productCode: productForm.productCode,
          name: productForm.name,
          description: productForm.description || undefined,
          categoryId: productForm.categoryId || undefined,
          brandId: productForm.brandId || undefined,
          status: 'active',
          isTrackable: true,
          hasVariants: productForm.hasVariants,
          variantMode: productForm.hasVariants ? productForm.variantMode : 'none',
        }),
      });
      await refreshBase();
      setProductForm({
        productCode: '',
        name: '',
        description: '',
        categoryId: '',
        brandId: '',
        hasVariants: false,
        variantMode: 'none',
      });
      setMessage('Product created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const createVariantGroup = async () => {
    if (!selectedProductId || !groupForm.code || !groupForm.name) return;
    setLoading(true);
    try {
      await readJson(`/api/catalog/products/${selectedProductId}/variant-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: groupForm.code,
          name: groupForm.name,
          inputType: groupForm.inputType,
          sortOrder: 0,
          isRequired: true,
          status: 'active',
        }),
      });
      await refreshDetail(selectedProductId);
      setGroupForm({ code: '', name: '', inputType: 'text' });
      setMessage('Variant group created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const createVariantOption = async () => {
    if (!selectedProductId || !optionForm.variantGroupId || !optionForm.code || !optionForm.label) return;
    setLoading(true);
    try {
      await readJson(`/api/catalog/products/${selectedProductId}/variant-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantGroupId: optionForm.variantGroupId,
          code: optionForm.code,
          label: optionForm.label,
          valueText: optionForm.valueText || undefined,
          colorHex: optionForm.colorHex || undefined,
          sortOrder: 0,
          status: 'active',
        }),
      });
      await refreshDetail(selectedProductId);
      setOptionForm({ variantGroupId: '', code: '', label: '', valueText: '', colorHex: '' });
      setMessage('Variant option created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const createSku = async () => {
    if (!selectedProductId || !skuForm.skuCode) return;
    setLoading(true);
    try {
      await readJson('/api/catalog/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductId,
          skuCode: skuForm.skuCode,
          barcode: skuForm.barcode || undefined,
          variantOptionIds: skuForm.variantOptionIds.length ? skuForm.variantOptionIds : undefined,
          unitName: skuForm.unitName || undefined,
          weightValue: skuForm.weightValue ? Number(skuForm.weightValue) : undefined,
          weightUnit: skuForm.weightUnit || undefined,
          status: 'active',
        }),
      });
      await refreshDetail(selectedProductId);
      setSkuForm({
        skuCode: '',
        barcode: '',
        unitName: '',
        weightValue: '',
        weightUnit: '',
        variantOptionIds: [],
      });
      setMessage('SKU created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const createPrice = async () => {
    if (!priceForm.skuId || !priceForm.salePrice) return;
    setLoading(true);
    try {
      await readJson('/api/catalog/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: priceForm.skuId,
          costPrice: priceForm.costPrice ? Number(priceForm.costPrice) : null,
          salePrice: Number(priceForm.salePrice),
          compareAtPrice: priceForm.compareAtPrice ? Number(priceForm.compareAtPrice) : null,
        }),
      });
      await refreshDetail(selectedProductId);
      setPriceForm({ skuId: '', costPrice: '', salePrice: '', compareAtPrice: '' });
      setMessage('Price created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const buildVariantMatrix = () => {
    if (!productDetail) {
      setMessage('Select a product first.');
      return;
    }

    const combos = buildVariantCombinations(productDetail.groups, variantSelection);
    if (!combos.length) {
      setVariantRows([]);
      setMessage('Select at least one option in each group to build the matrix.');
      return;
    }

    const baseSalePrice = Number(variantPricing.baseSalePrice || 0);
    const priceStep = Number(variantPricing.priceStep || 0);

    const rows = combos.map((combo, index) => {
      const variantOptionIds = combo.map((entry) => entry.option.id);
      const skuCode = buildVariantSkuCode(productDetail.product.product_code, combo);
      const variantLabel = buildVariantLabel(combo);
      const nextSalePrice = Number.isFinite(baseSalePrice) ? baseSalePrice + priceStep * index : 0;

      return {
        key: variantOptionIds.join('|'),
        skuCode,
        barcode: '',
        variantLabel,
        variantOptionIds,
        salePrice: nextSalePrice > 0 ? String(nextSalePrice.toFixed(2)) : '',
        costPrice: '',
        compareAtPrice: '',
      };
    });

    setVariantRows(rows);
    setMessage(`Built ${rows.length} variant combination(s).`);
  };

  const updateVariantRow = (
    key: string,
    field: 'skuCode' | 'barcode' | 'salePrice' | 'costPrice' | 'compareAtPrice',
    value: string,
  ) => {
    setVariantRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  };

  const createVariantRows = async () => {
    if (!productDetail || !variantRows.length) {
      setMessage('Build the variant matrix first.');
      return;
    }

    setLoading(true);
    try {
      let createdCount = 0;
      for (const row of variantRows) {
        const skuPayload = {
          productId: productDetail.product.id,
          skuCode: row.skuCode,
          barcode: row.barcode || undefined,
          variantOptionIds: row.variantOptionIds,
          status: 'active',
          salePrice: row.salePrice ? Number(row.salePrice) : undefined,
          costPrice: row.costPrice ? Number(row.costPrice) : undefined,
          compareAtPrice: row.compareAtPrice ? Number(row.compareAtPrice) : undefined,
        };
        const created = await readJson<{ sku?: { id: string; sku_code: string } }>('/api/catalog/skus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(skuPayload),
        });
        if (created?.sku?.id) {
          createdCount += 1;
        }
      }
      await refreshDetail(productDetail.product.id);
      await refreshBase();
      setVariantRows([]);
      setMessage(`Created ${createdCount} variant SKU(s) with pricing.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ display: 'grid', gap: 20 }}>
      {canManageCatalog ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 16 }}>
          <article style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Category</h3>
            <input value={categoryForm.code} onChange={(e) => setCategoryForm((v) => ({ ...v, code: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Code" />
            <input value={categoryForm.name} onChange={(e) => setCategoryForm((v) => ({ ...v, name: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Name" />
            <button onClick={createCategory} style={buttonStyle} disabled={loading}>Create Category</button>
          </article>

          <article style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Brand</h3>
            <input value={brandForm.name} onChange={(e) => setBrandForm({ name: e.target.value })} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Brand name" />
            <button onClick={createBrand} style={buttonStyle} disabled={loading}>Create Brand</button>
          </article>

          <article style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Product</h3>
            <input value={productForm.productCode} onChange={(e) => setProductForm((v) => ({ ...v, productCode: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Product code" />
            <input value={productForm.name} onChange={(e) => setProductForm((v) => ({ ...v, name: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Product name" />
            <textarea value={productForm.description} onChange={(e) => setProductForm((v) => ({ ...v, description: e.target.value }))} style={{ ...inputStyle, minHeight: 70, marginBottom: 10 }} placeholder="Description" />
            <select value={productForm.categoryId} onChange={(e) => setProductForm((v) => ({ ...v, categoryId: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }}>
              <option value="">No category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select value={productForm.brandId} onChange={(e) => setProductForm((v) => ({ ...v, brandId: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }}>
              <option value="">No brand</option>
              {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <input type="checkbox" checked={productForm.hasVariants} onChange={(e) => setProductForm((v) => ({ ...v, hasVariants: e.target.checked, variantMode: e.target.checked ? 'single' : 'none' }))} />
              Has manual variants
            </label>
            <select value={productForm.variantMode} onChange={(e) => setProductForm((v) => ({ ...v, variantMode: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} disabled={!productForm.hasVariants}>
              <option value="none">None</option>
              <option value="single">Single Variant Axis</option>
              <option value="multi">Multi Variant Axes</option>
            </select>
            <button onClick={createProduct} style={buttonStyle} disabled={loading}>Create Product</button>
          </article>
        </section>
      ) : (
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Read-only catalog access</h3>
          <p style={{ marginBottom: 0, color: '#475569' }}>
            Your role can view catalog data, but only owners and managers can create or change catalog records.
          </p>
        </article>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Products</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {products.map((product) => (
              <article
                key={product.id}
                onClick={() => setSelectedProductId(product.id)}
                  style={{
                    ...cardStyle,
                    padding: 14,
                    cursor: 'pointer',
                    border: selectedProductId === product.id ? '1px solid #2563eb' : '1px solid rgba(148, 163, 184, 0.22)',
                  }}
                >
                <div style={{ fontWeight: 600 }}>{product.name}</div>
                <div style={{ color: '#475569' }}>{product.product_code}</div>
                <div style={{ color: '#64748b' }}>
                  {product.variant_mode} · {product.sku_count} SKU(s) · {product.status}
                </div>
              </article>
            ))}
          </div>
        </article>

        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Product Builder</h3>
          {!productDetail ? (
            <p style={{ marginBottom: 0, color: '#475569' }}>Select a product to manage its manual variants, options, SKUs, and prices.</p>
          ) : (
            <section style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{productDetail.product.name}</div>
                <div style={{ color: '#475569' }}>
                  {productDetail.product.product_code} · {productDetail.product.variant_mode} · {productDetail.product.status}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {canManageCatalog ? (
                  <article style={{ ...cardStyle, padding: 14 }}>
                    <h4 style={{ marginTop: 0 }}>Variant Group</h4>
                    <input value={groupForm.code} onChange={(e) => setGroupForm((v) => ({ ...v, code: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="color / size / front / rear" />
                    <input value={groupForm.name} onChange={(e) => setGroupForm((v) => ({ ...v, name: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Display name" />
                    <select value={groupForm.inputType} onChange={(e) => setGroupForm((v) => ({ ...v, inputType: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }}>
                      <option value="text">Text</option>
                      <option value="color">Color</option>
                      <option value="number">Number</option>
                    </select>
                    <button onClick={createVariantGroup} style={buttonStyle} disabled={loading}>Add Group</button>
                  </article>
                ) : null}

                {canManageCatalog ? (
                  <article style={{ ...cardStyle, padding: 14 }}>
                    <h4 style={{ marginTop: 0 }}>Variant Option</h4>
                    <select value={optionForm.variantGroupId} onChange={(e) => setOptionForm((v) => ({ ...v, variantGroupId: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }}>
                      <option value="">Select group</option>
                      {productDetail.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                    <input value={optionForm.code} onChange={(e) => setOptionForm((v) => ({ ...v, code: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="black / xl / front" />
                    <input value={optionForm.label} onChange={(e) => setOptionForm((v) => ({ ...v, label: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Label" />
                    <input value={optionForm.valueText} onChange={(e) => setOptionForm((v) => ({ ...v, valueText: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Value text (optional)" />
                    <input value={optionForm.colorHex} onChange={(e) => setOptionForm((v) => ({ ...v, colorHex: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="#000000 for color" />
                    <button onClick={createVariantOption} style={buttonStyle} disabled={loading}>Add Option</button>
                  </article>
                ) : null}
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {productDetail.groups.map((group) => (
                  <article key={group.id} style={{ ...cardStyle, padding: 14 }}>
                    <div style={{ fontWeight: 600 }}>{group.name}</div>
                    <div style={{ color: '#475569', marginBottom: 8 }}>{group.code} · {group.input_type}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {group.options.map((option) => (
                        <span key={option.id} style={{ padding: '4px 8px', borderRadius: 6, background: '#ffffff', border: '1px solid rgba(148, 163, 184, 0.22)' }}>
                          {option.label}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              {canManageCatalog ? (
                <article style={{ ...cardStyle, padding: 14 }}>
                  <h4 style={{ marginTop: 0 }}>Variant Matrix</h4>
                  <p style={{ marginTop: 0, color: '#475569' }}>
                    Pick the options that should form variant combinations, then generate SKU rows with variant-specific prices.
                  </p>

                  <div style={{ display: 'grid', gap: 14 }}>
                    {productDetail.groups.map((group) => (
                      <div key={group.id} style={{ display: 'grid', gap: 8 }}>
                        <div style={{ fontWeight: 600 }}>{group.name}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {group.options.map((option) => {
                            const selectedIds = variantSelection[group.id] ?? group.options.map((item) => item.id);
                            const checked = selectedIds.includes(option.id);
                            return (
                              <label
                                key={option.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '6px 10px',
                                  borderRadius: 8,
                                  border: checked ? '1px solid #2563eb' : '1px solid rgba(148, 163, 184, 0.22)',
                                  background: checked ? 'rgba(37, 99, 235, 0.06)' : '#fff',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) =>
                                    setVariantSelection((current) => ({
                                      ...current,
                                      [group.id]: event.target.checked
                                        ? [...selectedIds, option.id]
                                        : selectedIds.filter((id) => id !== option.id),
                                    }))
                                  }
                                />
                                <span>{option.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 14 }}>
                    <input
                      value={variantPricing.baseSalePrice}
                      onChange={(event) => setVariantPricing((current) => ({ ...current, baseSalePrice: event.target.value }))}
                      style={inputStyle}
                      placeholder="Base sale price"
                    />
                    <input
                      value={variantPricing.priceStep}
                      onChange={(event) => setVariantPricing((current) => ({ ...current, priceStep: event.target.value }))}
                      style={inputStyle}
                      placeholder="Price step per combo"
                    />
                    <button onClick={buildVariantMatrix} style={buttonStyle} disabled={loading}>
                      Build Matrix
                    </button>
                    <button onClick={createVariantRows} style={buttonStyle} disabled={loading || variantRows.length === 0}>
                      Create All SKUs
                    </button>
                  </div>

                  {variantRows.length > 0 ? (
                    <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                      {variantRows.map((row) => (
                        <article key={row.key} style={{ ...cardStyle, padding: 12 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{row.variantLabel}</div>
                          <div style={{ color: '#64748b', marginBottom: 10 }}>{row.variantOptionIds.length} option(s) · {row.key}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                            <input value={row.skuCode} onChange={(event) => updateVariantRow(row.key, 'skuCode', event.target.value)} style={inputStyle} placeholder="SKU code" />
                            <input value={row.barcode} onChange={(event) => updateVariantRow(row.key, 'barcode', event.target.value)} style={inputStyle} placeholder="Barcode" />
                            <input value={row.salePrice} onChange={(event) => updateVariantRow(row.key, 'salePrice', event.target.value)} style={inputStyle} placeholder="Sale price" />
                            <input value={row.costPrice} onChange={(event) => updateVariantRow(row.key, 'costPrice', event.target.value)} style={inputStyle} placeholder="Cost price" />
                            <input value={row.compareAtPrice} onChange={(event) => updateVariantRow(row.key, 'compareAtPrice', event.target.value)} style={inputStyle} placeholder="Compare at price" />
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </article>
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {canManageCatalog ? (
                  <article style={{ ...cardStyle, padding: 14 }}>
                    <h4 style={{ marginTop: 0 }}>Manual SKU</h4>
                    <input value={skuForm.skuCode} onChange={(e) => setSkuForm((v) => ({ ...v, skuCode: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="SKU code" />
                    <input value={skuForm.barcode} onChange={(e) => setSkuForm((v) => ({ ...v, barcode: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Barcode" />
                    <input value={skuForm.unitName} onChange={(e) => setSkuForm((v) => ({ ...v, unitName: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Unit name" />
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input value={skuForm.weightValue} onChange={(e) => setSkuForm((v) => ({ ...v, weightValue: e.target.value }))} style={inputStyle} placeholder="Weight" />
                      <input value={skuForm.weightUnit} onChange={(e) => setSkuForm((v) => ({ ...v, weightUnit: e.target.value }))} style={inputStyle} placeholder="kg / lb / g" />
                    </div>
                    <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                      {variantOptionsFlat.map((option) => (
                        <label key={option.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={skuForm.variantOptionIds.includes(option.id)}
                            onChange={(e) =>
                              setSkuForm((v) => ({
                                ...v,
                                variantOptionIds: e.target.checked
                                  ? [...v.variantOptionIds, option.id]
                                  : v.variantOptionIds.filter((id) => id !== option.id),
                              }))
                            }
                          />
                          {option.groupName}: {option.label}
                        </label>
                      ))}
                    </div>
                    <button onClick={createSku} style={buttonStyle} disabled={loading}>Create SKU</button>
                  </article>
                ) : null}

                {canManageCatalog ? (
                  <article style={{ ...cardStyle, padding: 14 }}>
                    <h4 style={{ marginTop: 0 }}>Price</h4>
                    <select value={priceForm.skuId} onChange={(e) => setPriceForm((v) => ({ ...v, skuId: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }}>
                      <option value="">Select SKU</option>
                      {productDetail.skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.sku_code}</option>)}
                    </select>
                    <input value={priceForm.costPrice} onChange={(e) => setPriceForm((v) => ({ ...v, costPrice: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Cost price" />
                    <input value={priceForm.salePrice} onChange={(e) => setPriceForm((v) => ({ ...v, salePrice: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Sale price" />
                    <input value={priceForm.compareAtPrice} onChange={(e) => setPriceForm((v) => ({ ...v, compareAtPrice: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Compare at price" />
                    <button onClick={createPrice} style={buttonStyle} disabled={loading}>Save Price</button>
                  </article>
                ) : null}
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {productDetail.skus.map((sku) => (
                  <article key={sku.id} style={{ ...cardStyle, padding: 14 }}>
                    <div style={{ fontWeight: 600 }}>{sku.sku_code}</div>
                    <div style={{ color: '#475569' }}>
                      {sku.variant_label || 'No variant label'} · {sku.status}
                    </div>
                    <div style={{ color: '#64748b' }}>
                      Barcode: {sku.barcode || '—'} · Available: {Number(sku.available_qty ?? 0)} · Price: {sku.sale_price ?? '—'}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </article>
      </section>

      <article style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={{ marginBottom: 0, color: '#475569' }}>{message}</p>
      </article>
    </section>
  );
}
