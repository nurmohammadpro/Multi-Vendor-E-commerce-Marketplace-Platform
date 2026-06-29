'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../motocore-theme';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';

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
type Location = {
  id: string;
  code: string;
  name: string;
  location_type: string;
  status: string;
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

export function CatalogWorkspace({
  canManageCatalog,
  canApprovePriceChanges,
}: {
  canManageCatalog: boolean;
  canApprovePriceChanges: boolean;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Catalog workspace is ready.');

  const [categoryForm, setCategoryForm] = useState({ code: '', name: '' });
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [brandForm, setBrandForm] = useState({ name: '' });
  const [editingBrandId, setEditingBrandId] = useState('');
  const [productForm, setProductForm] = useState({
    productCode: '',
    name: '',
    description: '',
    categoryId: '',
    brandId: '',
    hasVariants: false,
    variantMode: 'none',
  });
  const [editingProductId, setEditingProductId] = useState('');
  const [groupForm, setGroupForm] = useState({
    code: '',
    name: '',
    inputType: 'text',
  });
  const [editingGroupId, setEditingGroupId] = useState('');
  const [optionForm, setOptionForm] = useState({
    variantGroupId: '',
    code: '',
    label: '',
    valueText: '',
    colorHex: '',
  });
  const [editingOptionId, setEditingOptionId] = useState('');
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
    reason: '',
  });
  const [approvalNote, setApprovalNote] = useState('');
  const [priceChangeRequests, setPriceChangeRequests] = useState<Array<{
    id: string;
    sku_id: string;
    sku_code: string;
    product_name: string;
    variant_label?: string | null;
    current_sale_price: string | number;
    requested_sale_price: string | number;
    current_cost_price?: string | number | null;
    requested_cost_price?: string | number | null;
    current_compare_at_price?: string | number | null;
    requested_compare_at_price?: string | number | null;
    reason: string;
    status: string;
    requested_by_name?: string | null;
    decision_note?: string | null;
    created_at: string;
  }>>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productStatus, setProductStatus] = useState('');
  const [priceRequestSearch, setPriceRequestSearch] = useState('');
  const [priceRequestStatus, setPriceRequestStatus] = useState('');
  const [categoryPage, setCategoryPage] = useState(1);
  const [brandPage, setBrandPage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [priceRequestPage, setPriceRequestPage] = useState(1);
  const [categoryPagination, setCategoryPagination] = useState<PaginationState>({ page: 1, limit: 8, total: 0 });
  const [brandPagination, setBrandPagination] = useState<PaginationState>({ page: 1, limit: 8, total: 0 });
  const [productPagination, setProductPagination] = useState<PaginationState>({ page: 1, limit: 12, total: 0 });
  const [priceRequestPagination, setPriceRequestPagination] = useState<PaginationState>({ page: 1, limit: 12, total: 0 });
  const [variantSelection, setVariantSelection] = useState<Record<string, string[]>>({});
  const [variantRows, setVariantRows] = useState<VariantMatrixRow[]>([]);
  const [variantPricing, setVariantPricing] = useState({
    baseSalePrice: '',
    priceStep: '',
  });
  const [quickProductForm, setQuickProductForm] = useState({
    categoryId: '',
    brandId: '',
    productCode: '',
    name: '',
    description: '',
    variantMode: 'none',
    axisOneName: 'Color',
    axisOneValues: '',
    axisTwoName: 'Size',
    axisTwoValues: '',
    salePrice: '',
    costPrice: '',
    compareAtPrice: '',
    openingQtyPerSku: '',
    locationId: '',
    unitName: '',
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
  const selectedPriceSku = useMemo(
    () => productDetail?.skus.find((sku) => sku.id === priceForm.skuId) ?? null,
    [priceForm.skuId, productDetail],
  );
  const selectedSkuHasCurrentPrice = selectedPriceSku?.sale_price !== null && selectedPriceSku?.sale_price !== undefined;
  const shouldRequestPriceApproval = selectedSkuHasCurrentPrice && !canApprovePriceChanges;

  const refreshBase = async (
    nextCategoryPage = categoryPage,
    nextBrandPage = brandPage,
    nextProductPage = productPage,
  ) => {
    const categoryParams = new URLSearchParams({ page: String(nextCategoryPage), limit: String(categoryPagination.limit) });
    const brandParams = new URLSearchParams({ page: String(nextBrandPage), limit: String(brandPagination.limit) });
    const productParams = new URLSearchParams({ page: String(nextProductPage), limit: String(productPagination.limit) });
    if (categorySearch.trim()) categoryParams.set('search', categorySearch.trim());
    if (brandSearch.trim()) brandParams.set('search', brandSearch.trim());
    if (productSearch.trim()) productParams.set('search', productSearch.trim());
    if (productStatus) productParams.set('status', productStatus);
    const [categoryPayload, brandPayload, productPayload] = await Promise.all([
      readJson<{ categories: Category[]; pagination?: PaginationState }>(`/api/catalog/categories?${categoryParams.toString()}`),
      readJson<{ brands: Brand[]; pagination?: PaginationState }>(`/api/catalog/brands?${brandParams.toString()}`),
      readJson<{ products: Product[]; pagination?: PaginationState }>(`/api/catalog/products?${productParams.toString()}`),
    ]);
    setCategories(categoryPayload.categories ?? []);
    setBrands(brandPayload.brands ?? []);
    setProducts(productPayload.products ?? []);
    setCategoryPagination(categoryPayload.pagination ?? { page: nextCategoryPage, limit: categoryPagination.limit, total: categoryPayload.categories?.length ?? 0 });
    setBrandPagination(brandPayload.pagination ?? { page: nextBrandPage, limit: brandPagination.limit, total: brandPayload.brands?.length ?? 0 });
    setProductPagination(productPayload.pagination ?? { page: nextProductPage, limit: productPagination.limit, total: productPayload.products?.length ?? 0 });
    setCategoryPage(categoryPayload.pagination?.page ?? nextCategoryPage);
    setBrandPage(brandPayload.pagination?.page ?? nextBrandPage);
    setProductPage(productPayload.pagination?.page ?? nextProductPage);
  };

  const refreshLocations = async () => {
    const payload = await readJson<{ locations: Location[] }>('/api/inventory/locations');
    const nextLocations = payload.locations ?? [];
    setLocations(nextLocations);
    setQuickProductForm((current) => ({
      ...current,
      locationId: current.locationId || nextLocations[0]?.id || '',
    }));
  };

  const refreshPriceRequests = async (nextPage = priceRequestPage) => {
    const params = new URLSearchParams({ page: String(nextPage), limit: String(priceRequestPagination.limit) });
    if (priceRequestSearch.trim()) params.set('search', priceRequestSearch.trim());
    if (priceRequestStatus) params.set('status', priceRequestStatus);
    const payload = await readJson<{ priceChangeRequests: typeof priceChangeRequests; pagination?: PaginationState }>(`/api/catalog/price-change-requests?${params.toString()}`);
    setPriceChangeRequests(payload.priceChangeRequests ?? []);
    setPriceRequestPagination(payload.pagination ?? { page: nextPage, limit: priceRequestPagination.limit, total: payload.priceChangeRequests?.length ?? 0 });
    setPriceRequestPage(payload.pagination?.page ?? nextPage);
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
    void refreshBase(1, 1, 1).catch((error: Error) => setMessage(error.message));
    void refreshPriceRequests(1).catch((error: Error) => setMessage(error.message));
    void refreshLocations().catch((error: Error) => setMessage(error.message));
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
      await readJson(editingCategoryId ? `/api/catalog/categories/${editingCategoryId}` : '/api/catalog/categories', {
        method: editingCategoryId ? 'PATCH' : 'POST',
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
      setEditingCategoryId('');
      setMessage(editingCategoryId ? 'Category updated.' : 'Category created.');
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
      await readJson(editingBrandId ? `/api/catalog/brands/${editingBrandId}` : '/api/catalog/brands', {
        method: editingBrandId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: brandForm.name,
          status: 'active',
        }),
      });
      await refreshBase();
      setBrandForm({ name: '' });
      setEditingBrandId('');
      setMessage(editingBrandId ? 'Brand updated.' : 'Brand created.');
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
      await readJson(editingProductId ? `/api/catalog/products/${editingProductId}` : '/api/catalog/products', {
        method: editingProductId ? 'PATCH' : 'POST',
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
      setEditingProductId('');
      setMessage(editingProductId ? 'Product updated.' : 'Product created.');
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
      await readJson(editingGroupId ? `/api/catalog/variant-groups/${editingGroupId}` : `/api/catalog/products/${selectedProductId}/variant-groups`, {
        method: editingGroupId ? 'PATCH' : 'POST',
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
      setEditingGroupId('');
      setMessage(editingGroupId ? 'Variant group updated.' : 'Variant group created.');
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
      await readJson(editingOptionId ? `/api/catalog/variant-options/${editingOptionId}` : `/api/catalog/products/${selectedProductId}/variant-options`, {
        method: editingOptionId ? 'PATCH' : 'POST',
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
      setEditingOptionId('');
      setMessage(editingOptionId ? 'Variant option updated.' : 'Variant option created.');
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
      const path = shouldRequestPriceApproval ? '/api/catalog/price-change-requests' : '/api/catalog/prices';
      await readJson(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: priceForm.skuId,
          costPrice: priceForm.costPrice ? Number(priceForm.costPrice) : null,
          salePrice: Number(priceForm.salePrice),
          compareAtPrice: priceForm.compareAtPrice ? Number(priceForm.compareAtPrice) : null,
          reason: shouldRequestPriceApproval ? priceForm.reason : undefined,
        }),
      });
      await refreshDetail(selectedProductId);
      await refreshPriceRequests();
      setPriceForm({ skuId: '', costPrice: '', salePrice: '', compareAtPrice: '', reason: '' });
      setMessage(shouldRequestPriceApproval ? 'Price update submitted for owner approval.' : 'Price saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const decidePriceRequest = async (requestId: string, decision: 'approve' | 'reject') => {
    setLoading(true);
    try {
      await readJson(`/api/catalog/price-change-requests/${requestId}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionNote: approvalNote || undefined,
        }),
      });
      await refreshPriceRequests();
      await refreshDetail(selectedProductId);
      setApprovalNote('');
      setMessage(`Price request ${decision}d successfully.`);
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

  const buildQuickVariantRows = () => {
    const axisOneValues = quickProductForm.axisOneValues
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const axisTwoValues = quickProductForm.axisTwoValues
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (quickProductForm.variantMode === 'none') {
      return [
        {
          label: 'Base product',
          skuCode: sanitizeSkuToken(quickProductForm.productCode || quickProductForm.name || 'SKU'),
        },
      ];
    }

    if (quickProductForm.variantMode === 'single') {
      return axisOneValues.map((value) => ({
        label: `${quickProductForm.axisOneName}: ${value}`,
        skuCode: sanitizeSkuToken(`${quickProductForm.productCode}-${value}`),
      }));
    }

    return axisOneValues.flatMap((axisOne) =>
      axisTwoValues.map((axisTwo) => ({
        label: `${quickProductForm.axisOneName}: ${axisOne} / ${quickProductForm.axisTwoName}: ${axisTwo}`,
        skuCode: sanitizeSkuToken(`${quickProductForm.productCode}-${axisOne}-${axisTwo}`),
      })),
    );
  };

  const quickVariantPreview = useMemo(buildQuickVariantRows, [quickProductForm]);

  const submitQuickProduct = async () => {
    if (!quickProductForm.productCode.trim() || !quickProductForm.name.trim()) {
      setMessage('Product code and product name are required.');
      return;
    }

    if (quickProductForm.variantMode !== 'none' && quickVariantPreview.length === 0) {
      setMessage('Enter variant values to generate at least one SKU.');
      return;
    }

    setLoading(true);
    try {
      const createdProduct = await readJson<{ product: { id: string; product_code: string } }>('/api/catalog/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productCode: quickProductForm.productCode,
          name: quickProductForm.name,
          description: quickProductForm.description || undefined,
          categoryId: quickProductForm.categoryId || undefined,
          brandId: quickProductForm.brandId || undefined,
          status: 'active',
          isTrackable: true,
          hasVariants: quickProductForm.variantMode !== 'none',
          variantMode: quickProductForm.variantMode,
        }),
      });

      const productId = createdProduct.product.id;
      if (quickProductForm.variantMode !== 'none') {
        const axisGroups = [
          {
            enabled: true,
            name: quickProductForm.axisOneName,
            code: sanitizeSkuToken(quickProductForm.axisOneName).toLowerCase(),
            values: quickProductForm.axisOneValues.split(',').map((value) => value.trim()).filter(Boolean),
          },
          {
            enabled: quickProductForm.variantMode === 'multi',
            name: quickProductForm.axisTwoName,
            code: sanitizeSkuToken(quickProductForm.axisTwoName).toLowerCase(),
            values: quickProductForm.axisTwoValues.split(',').map((value) => value.trim()).filter(Boolean),
          },
        ].filter((group) => group.enabled);

        const optionMap = new Map<string, string>();

        for (const group of axisGroups) {
          const groupPayload = await readJson<{ group: { id: string } }>(`/api/catalog/products/${productId}/variant-groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: group.code || 'variant',
              name: group.name,
              inputType: 'text',
              sortOrder: axisGroups.findIndex((item) => item.name === group.name),
              isRequired: true,
              status: 'active',
            }),
          });

          for (const [index, value] of group.values.entries()) {
            const optionPayload = await readJson<{ option: { id: string } }>(`/api/catalog/products/${productId}/variant-options`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                variantGroupId: groupPayload.group.id,
                code: sanitizeSkuToken(value) || `option-${index + 1}`,
                label: value,
                valueText: value,
                sortOrder: index,
                status: 'active',
              }),
            });
            optionMap.set(`${group.name}:${value}`, optionPayload.option.id);
          }
        }

        for (const row of quickVariantPreview) {
          const variantOptionIds = row.label === 'Base product'
            ? []
            : row.label.split(' / ').map((chunk) => optionMap.get(chunk)).filter(Boolean) as string[];

          const skuPayload = await readJson<{ sku: { id: string } }>('/api/catalog/skus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId,
              skuCode: row.skuCode,
              variantOptionIds,
              unitName: quickProductForm.unitName || undefined,
              costPrice: quickProductForm.costPrice ? Number(quickProductForm.costPrice) : null,
              salePrice: quickProductForm.salePrice ? Number(quickProductForm.salePrice) : undefined,
              compareAtPrice: quickProductForm.compareAtPrice ? Number(quickProductForm.compareAtPrice) : null,
              status: 'active',
            }),
          });

          if (quickProductForm.locationId && quickProductForm.openingQtyPerSku) {
            await readJson('/api/inventory/initialize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                locationId: quickProductForm.locationId,
                skuId: skuPayload.sku.id,
                quantity: Number(quickProductForm.openingQtyPerSku),
                note: 'Opening stock from quick product entry',
              }),
            });
          }
        }
      } else {
        const skuPayload = await readJson<{ sku: { id: string } }>('/api/catalog/skus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            skuCode: sanitizeSkuToken(quickProductForm.productCode),
            unitName: quickProductForm.unitName || undefined,
            costPrice: quickProductForm.costPrice ? Number(quickProductForm.costPrice) : null,
            salePrice: quickProductForm.salePrice ? Number(quickProductForm.salePrice) : undefined,
            compareAtPrice: quickProductForm.compareAtPrice ? Number(quickProductForm.compareAtPrice) : null,
            status: 'active',
          }),
        });

        if (quickProductForm.locationId && quickProductForm.openingQtyPerSku) {
          await readJson('/api/inventory/initialize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              locationId: quickProductForm.locationId,
              skuId: skuPayload.sku.id,
              quantity: Number(quickProductForm.openingQtyPerSku),
              note: 'Opening stock from quick product entry',
            }),
          });
        }
      }

      await refreshBase(1, 1, 1);
      await refreshLocations();
      setQuickProductForm({
        categoryId: '',
        brandId: '',
        productCode: '',
        name: '',
        description: '',
        variantMode: 'none',
        axisOneName: 'Color',
        axisOneValues: '',
        axisTwoName: 'Size',
        axisTwoValues: '',
        salePrice: '',
        costPrice: '',
        compareAtPrice: '',
        openingQtyPerSku: '',
        locationId: locations[0]?.id || '',
        unitName: '',
      });
      setMessage(`Product pipeline completed with ${quickVariantPreview.length} SKU(s).`);
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
            <button onClick={createCategory} style={buttonStyle} disabled={loading}>{editingCategoryId ? 'Save Category' : 'Create Category'}</button>
          </article>

          <article style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Brand</h3>
            <input value={brandForm.name} onChange={(e) => setBrandForm({ name: e.target.value })} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Brand name" />
            <button onClick={createBrand} style={buttonStyle} disabled={loading}>{editingBrandId ? 'Save Brand' : 'Create Brand'}</button>
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
            <button onClick={createProduct} style={buttonStyle} disabled={loading}>{editingProductId ? 'Save Product' : 'Create Product'}</button>
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

      {canManageCatalog ? (
        <article style={cardStyle}>
          <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Quick Product Entry</h3>
            <p style={{ ...tokenMutedStyle, marginTop: 0 }}>
              One flow: create the product, generate its SKU set, attach default prices, and post opening stock without jumping across separate panels.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <input value={quickProductForm.productCode} onChange={(event) => setQuickProductForm((current) => ({ ...current, productCode: event.target.value }))} style={inputStyle} placeholder="Quick product code" />
              <input value={quickProductForm.name} onChange={(event) => setQuickProductForm((current) => ({ ...current, name: event.target.value }))} style={inputStyle} placeholder="Quick product name" />
              <select value={quickProductForm.categoryId} onChange={(event) => setQuickProductForm((current) => ({ ...current, categoryId: event.target.value }))} style={inputStyle}>
                <option value="">Choose category</option>
                {categories.filter((category) => category.status === 'active').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select value={quickProductForm.brandId} onChange={(event) => setQuickProductForm((current) => ({ ...current, brandId: event.target.value }))} style={inputStyle}>
                <option value="">Choose brand</option>
                {brands.filter((brand) => brand.status === 'active').map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </div>

            <textarea value={quickProductForm.description} onChange={(event) => setQuickProductForm((current) => ({ ...current, description: event.target.value }))} style={{ ...inputStyle, minHeight: 72 }} placeholder="Quick notes" />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <select value={quickProductForm.variantMode} onChange={(event) => setQuickProductForm((current) => ({ ...current, variantMode: event.target.value }))} style={inputStyle}>
                <option value="none">Simple product</option>
                <option value="single">One variant axis</option>
                <option value="multi">Two variant axes</option>
              </select>
              <input value={quickProductForm.salePrice} onChange={(event) => setQuickProductForm((current) => ({ ...current, salePrice: event.target.value }))} style={inputStyle} placeholder="Sale price" />
              <input value={quickProductForm.costPrice} onChange={(event) => setQuickProductForm((current) => ({ ...current, costPrice: event.target.value }))} style={inputStyle} placeholder="Cost price" />
              <input value={quickProductForm.compareAtPrice} onChange={(event) => setQuickProductForm((current) => ({ ...current, compareAtPrice: event.target.value }))} style={inputStyle} placeholder="Compare at price" />
              <input value={quickProductForm.openingQtyPerSku} onChange={(event) => setQuickProductForm((current) => ({ ...current, openingQtyPerSku: event.target.value }))} style={inputStyle} placeholder="Opening qty per SKU" />
              <select value={quickProductForm.locationId} onChange={(event) => setQuickProductForm((current) => ({ ...current, locationId: event.target.value }))} style={inputStyle}>
                <option value="">Opening stock location</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.code} — {location.name}</option>)}
              </select>
            </div>

            {quickProductForm.variantMode !== 'none' ? (
              <div style={{ display: 'grid', gridTemplateColumns: quickProductForm.variantMode === 'multi' ? '1fr 1fr' : '1fr', gap: 12 }}>
                <article style={{ ...cardStyle, padding: 14 }}>
                  <h4 style={{ marginTop: 0, marginBottom: 10 }}>Axis One</h4>
                  <input value={quickProductForm.axisOneName} onChange={(event) => setQuickProductForm((current) => ({ ...current, axisOneName: event.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Axis name (e.g. Color)" />
                  <textarea value={quickProductForm.axisOneValues} onChange={(event) => setQuickProductForm((current) => ({ ...current, axisOneValues: event.target.value }))} style={{ ...inputStyle, minHeight: 76 }} placeholder="Comma separated values, e.g. Black, White, Blue" />
                </article>
                {quickProductForm.variantMode === 'multi' ? (
                  <article style={{ ...cardStyle, padding: 14 }}>
                    <h4 style={{ marginTop: 0, marginBottom: 10 }}>Axis Two</h4>
                    <input value={quickProductForm.axisTwoName} onChange={(event) => setQuickProductForm((current) => ({ ...current, axisTwoName: event.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Axis name (e.g. Size)" />
                    <textarea value={quickProductForm.axisTwoValues} onChange={(event) => setQuickProductForm((current) => ({ ...current, axisTwoValues: event.target.value }))} style={{ ...inputStyle, minHeight: 76 }} placeholder="Comma separated values, e.g. S, M, L" />
                  </article>
                ) : null}
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Generated SKU preview</div>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Label</th>
                      <th style={tableHeaderCellStyle}>SKU Code</th>
                      <th style={tableHeaderCellStyle}>Default Sale</th>
                      <th style={tableHeaderCellStyle}>Opening Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quickVariantPreview.map((row) => (
                      <tr key={row.skuCode}>
                        <td style={tableCellStyle}>{row.label}</td>
                        <td style={tableCellStyle}>{row.skuCode}</td>
                        <td style={tableCellStyle}>{quickProductForm.salePrice || '—'}</td>
                        <td style={tableCellStyle}>{quickProductForm.openingQtyPerSku || '0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={submitQuickProduct} style={buttonStyle} disabled={loading}>Run Quick Pipeline</button>
              <button
                onClick={() => setQuickProductForm((current) => ({
                  ...current,
                  productCode: '',
                  name: '',
                  description: '',
                  salePrice: '',
                  costPrice: '',
                  compareAtPrice: '',
                  openingQtyPerSku: '',
                  axisOneValues: '',
                  axisTwoValues: '',
                }))}
                style={buttonStyle}
                disabled={loading}
              >
                Clear
              </button>
            </div>
          </div>
        </article>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Categories</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, marginBottom: 12 }}>
            <input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} style={inputStyle} placeholder="Search categories" />
            <button onClick={() => void refreshBase(1, brandPage, productPage)} style={buttonStyle} disabled={loading}>Search</button>
          </div>
          {categories.length ? (
            <>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Code</th>
                      <th style={tableHeaderCellStyle}>Name</th>
                      <th style={tableHeaderCellStyle}>Status</th>
                      <th style={tableHeaderCellStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category) => (
                      <tr key={category.id}>
                        <td style={tableCellStyle}>{category.code}</td>
                        <td style={tableCellStyle}>{category.name}</td>
                        <td style={tableCellStyle}>{category.status}</td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => {
                                setEditingCategoryId(category.id);
                                setCategoryForm({ code: category.code, name: category.name });
                              }}
                              style={buttonStyle}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => void readJson(`/api/catalog/categories/${category.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: category.status === 'inactive' ? 'active' : 'inactive' }),
                              }).then(() => refreshBase()).then(() => setMessage(`Category ${category.status === 'inactive' ? 'activated' : 'archived'}.`)).catch((error: Error) => setMessage(error.message))}
                              style={buttonStyle}
                            >
                              {category.status === 'inactive' ? 'Activate' : 'Archive'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPager
                loading={loading}
                page={categoryPage}
                pagination={categoryPagination}
                label="category(s)"
                onPrevious={() => void refreshBase(Math.max(1, categoryPage - 1), brandPage, productPage)}
                onNext={() => void refreshBase(Math.min(totalPagesFor(categoryPagination), categoryPage + 1), brandPage, productPage)}
              />
            </>
          ) : <div style={emptyStateStyle}>No categories yet.</div>}
        </article>

        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Brands</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, marginBottom: 12 }}>
            <input value={brandSearch} onChange={(event) => setBrandSearch(event.target.value)} style={inputStyle} placeholder="Search brands" />
            <button onClick={() => void refreshBase(categoryPage, 1, productPage)} style={buttonStyle} disabled={loading}>Search</button>
          </div>
          {brands.length ? (
            <>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Brand</th>
                      <th style={tableHeaderCellStyle}>Status</th>
                      <th style={tableHeaderCellStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brands.map((brand) => (
                      <tr key={brand.id}>
                        <td style={tableCellStyle}>{brand.name}</td>
                        <td style={tableCellStyle}>{brand.status}</td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => {
                                setEditingBrandId(brand.id);
                                setBrandForm({ name: brand.name });
                              }}
                              style={buttonStyle}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => void readJson(`/api/catalog/brands/${brand.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: brand.status === 'inactive' ? 'active' : 'inactive' }),
                              }).then(() => refreshBase()).then(() => setMessage(`Brand ${brand.status === 'inactive' ? 'activated' : 'archived'}.`)).catch((error: Error) => setMessage(error.message))}
                              style={buttonStyle}
                            >
                              {brand.status === 'inactive' ? 'Activate' : 'Archive'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPager
                loading={loading}
                page={brandPage}
                pagination={brandPagination}
                label="brand(s)"
                onPrevious={() => void refreshBase(categoryPage, Math.max(1, brandPage - 1), productPage)}
                onNext={() => void refreshBase(categoryPage, Math.min(totalPagesFor(brandPagination), brandPage + 1), productPage)}
              />
            </>
          ) : <div style={emptyStateStyle}>No brands yet.</div>}
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Products</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(140px, 180px) auto', gap: 8, marginBottom: 12 }}>
            <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} style={inputStyle} placeholder="Search product, code, category, brand" />
            <select value={productStatus} onChange={(event) => setProductStatus(event.target.value)} style={inputStyle}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
            <button onClick={() => void refreshBase(categoryPage, brandPage, 1)} style={buttonStyle} disabled={loading}>Search</button>
          </div>
          {products.length ? (
            <>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Product</th>
                      <th style={tableHeaderCellStyle}>Code</th>
                      <th style={tableHeaderCellStyle}>Category</th>
                      <th style={tableHeaderCellStyle}>Brand</th>
                      <th style={tableHeaderCellStyle}>Variant Mode</th>
                      <th style={tableHeaderCellStyle}>SKUs</th>
                      <th style={tableHeaderCellStyle}>Status</th>
                      <th style={tableHeaderCellStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr
                        key={product.id}
                        onClick={() => setSelectedProductId(product.id)}
                        style={{ cursor: 'pointer', background: selectedProductId === product.id ? 'rgba(241,245,249,0.9)' : '#fff' }}
                      >
                        <td style={tableCellStyle}><strong>{product.name}</strong></td>
                        <td style={tableCellStyle}>{product.product_code}</td>
                        <td style={tableCellStyle}>{product.category_name || '—'}</td>
                        <td style={tableCellStyle}>{product.brand_name || '—'}</td>
                        <td style={tableCellStyle}>{product.variant_mode}</td>
                        <td style={tableCellStyle}>{product.sku_count}</td>
                        <td style={tableCellStyle}>{product.status}</td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditingProductId(product.id);
                                setProductForm((current) => ({
                                  ...current,
                                  productCode: product.product_code,
                                  name: product.name,
                                  categoryId: categories.find((item) => item.name === product.category_name)?.id || '',
                                  brandId: brands.find((item) => item.name === product.brand_name)?.id || '',
                                  hasVariants: product.has_variants,
                                  variantMode: product.variant_mode,
                                }));
                              }}
                              style={buttonStyle}
                            >
                              Edit
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                void readJson(`/api/catalog/products/${product.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: product.status === 'archived' ? 'active' : 'archived' }),
                                }).then(() => refreshBase()).then(() => setMessage(`Product ${product.status === 'archived' ? 'activated' : 'archived'}.`)).catch((error: Error) => setMessage(error.message));
                              }}
                              style={buttonStyle}
                            >
                              {product.status === 'archived' ? 'Activate' : 'Archive'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPager
                loading={loading}
                page={productPage}
                pagination={productPagination}
                label="product(s)"
                onPrevious={() => void refreshBase(categoryPage, brandPage, Math.max(1, productPage - 1))}
                onNext={() => void refreshBase(categoryPage, brandPage, Math.min(totalPagesFor(productPagination), productPage + 1))}
              />
            </>
          ) : (
            <div style={emptyStateStyle}>No products yet.</div>
          )}
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
                    <button onClick={createVariantGroup} style={buttonStyle} disabled={loading}>{editingGroupId ? 'Save Group' : 'Add Group'}</button>
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
                    <button onClick={createVariantOption} style={buttonStyle} disabled={loading}>{editingOptionId ? 'Save Option' : 'Add Option'}</button>
                  </article>
                ) : null}
              </div>

              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Group</th>
                      <th style={tableHeaderCellStyle}>Code</th>
                      <th style={tableHeaderCellStyle}>Type</th>
                      <th style={tableHeaderCellStyle}>Required</th>
                      <th style={tableHeaderCellStyle}>Options</th>
                      <th style={tableHeaderCellStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productDetail.groups.map((group) => (
                      <tr key={group.id}>
                        <td style={tableCellStyle}>{group.name}</td>
                        <td style={tableCellStyle}>{group.code}</td>
                        <td style={tableCellStyle}>{group.input_type}</td>
                        <td style={tableCellStyle}>{group.is_required ? 'Yes' : 'No'}</td>
                        <td style={tableCellStyle}>{group.options.map((option) => option.label).join(', ') || '—'}</td>
                        <td style={tableCellStyle}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => {
                                setEditingGroupId(group.id);
                                setGroupForm({ code: group.code, name: group.name, inputType: group.input_type });
                              }}
                              style={buttonStyle}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => void readJson(`/api/catalog/variant-groups/${group.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: group.status === 'inactive' ? 'active' : 'inactive' }),
                              }).then(() => refreshDetail(selectedProductId)).then(() => setMessage(`Variant group ${group.status === 'inactive' ? 'activated' : 'archived'}.`)).catch((error: Error) => setMessage(error.message))}
                              style={buttonStyle}
                            >
                              {group.status === 'inactive' ? 'Activate' : 'Archive'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Group</th>
                      <th style={tableHeaderCellStyle}>Option</th>
                      <th style={tableHeaderCellStyle}>Code</th>
                      <th style={tableHeaderCellStyle}>Display Value</th>
                      <th style={tableHeaderCellStyle}>Status</th>
                      <th style={tableHeaderCellStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productDetail.groups.flatMap((group) =>
                      group.options.map((option) => (
                        <tr key={option.id}>
                          <td style={tableCellStyle}>{group.name}</td>
                          <td style={tableCellStyle}>{option.label}</td>
                          <td style={tableCellStyle}>{option.code}</td>
                          <td style={tableCellStyle}>{option.valueText || option.colorHex || option.valueNumber || '—'}</td>
                          <td style={tableCellStyle}>{option.status}</td>
                          <td style={tableCellStyle}>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                onClick={() => {
                                  setEditingOptionId(option.id);
                                  setOptionForm({
                                    variantGroupId: group.id,
                                    code: option.code,
                                    label: option.label,
                                    valueText: option.valueText || '',
                                    colorHex: option.colorHex || '',
                                  });
                                }}
                                style={buttonStyle}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => void readJson(`/api/catalog/variant-options/${option.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: option.status === 'inactive' ? 'active' : 'inactive' }),
                                }).then(() => refreshDetail(selectedProductId)).then(() => setMessage(`Variant option ${option.status === 'inactive' ? 'activated' : 'archived'}.`)).catch((error: Error) => setMessage(error.message))}
                                style={buttonStyle}
                              >
                                {option.status === 'inactive' ? 'Activate' : 'Archive'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                          <div style={{ fontWeight: 600 }}>{group.name}</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() =>
                                setVariantSelection((current) => ({
                                  ...current,
                                  [group.id]: group.options.map((option) => option.id),
                                }))
                              }
                              style={buttonStyle}
                            >
                              Select all
                            </button>
                            <button
                              onClick={() =>
                                setVariantSelection((current) => ({
                                  ...current,
                                  [group.id]: [],
                                }))
                              }
                              style={buttonStyle}
                            >
                              Clear
                            </button>
                          </div>
                        </div>
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
                    <div style={{ ...tableWrapStyle, marginTop: 14 }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={tableHeaderCellStyle}>Variant</th>
                            <th style={tableHeaderCellStyle}>SKU</th>
                            <th style={tableHeaderCellStyle}>Barcode</th>
                            <th style={tableHeaderCellStyle}>Sale Price</th>
                            <th style={tableHeaderCellStyle}>Cost Price</th>
                            <th style={tableHeaderCellStyle}>Compare Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variantRows.map((row) => (
                            <tr key={row.key}>
                              <td style={tableCellStyle}>
                                <div style={{ fontWeight: 600 }}>{row.variantLabel}</div>
                                <div style={{ color: '#64748b', marginTop: 4 }}>{row.variantOptionIds.length} option(s)</div>
                              </td>
                              <td style={tableCellStyle}><input value={row.skuCode} onChange={(event) => updateVariantRow(row.key, 'skuCode', event.target.value)} style={inputStyle} placeholder="SKU code" /></td>
                              <td style={tableCellStyle}><input value={row.barcode} onChange={(event) => updateVariantRow(row.key, 'barcode', event.target.value)} style={inputStyle} placeholder="Barcode" /></td>
                              <td style={tableCellStyle}><input value={row.salePrice} onChange={(event) => updateVariantRow(row.key, 'salePrice', event.target.value)} style={inputStyle} placeholder="Sale price" /></td>
                              <td style={tableCellStyle}><input value={row.costPrice} onChange={(event) => updateVariantRow(row.key, 'costPrice', event.target.value)} style={inputStyle} placeholder="Cost price" /></td>
                              <td style={tableCellStyle}><input value={row.compareAtPrice} onChange={(event) => updateVariantRow(row.key, 'compareAtPrice', event.target.value)} style={inputStyle} placeholder="Compare at price" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
                    {selectedPriceSku ? (
                      <div style={{ marginBottom: 10, color: '#475569', fontSize: 14 }}>
                        Current price: {selectedSkuHasCurrentPrice ? String(selectedPriceSku.sale_price) : 'No price yet'}
                        {selectedPriceSku.variant_label ? ` · ${selectedPriceSku.variant_label}` : ''}
                      </div>
                    ) : null}
                    <input value={priceForm.costPrice} onChange={(e) => setPriceForm((v) => ({ ...v, costPrice: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Cost price" />
                    <input value={priceForm.salePrice} onChange={(e) => setPriceForm((v) => ({ ...v, salePrice: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Sale price" />
                    <input value={priceForm.compareAtPrice} onChange={(e) => setPriceForm((v) => ({ ...v, compareAtPrice: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} placeholder="Compare at price" />
                    {shouldRequestPriceApproval ? (
                      <textarea
                        value={priceForm.reason}
                        onChange={(e) => setPriceForm((v) => ({ ...v, reason: e.target.value }))}
                        style={{ ...inputStyle, minHeight: 78, marginBottom: 10 }}
                        placeholder="Reason for manager price update request"
                      />
                    ) : null}
                    <button
                      onClick={createPrice}
                      style={buttonStyle}
                      disabled={loading || (shouldRequestPriceApproval && priceForm.reason.trim().length < 3)}
                    >
                      {shouldRequestPriceApproval ? 'Request Price Approval' : 'Save Price'}
                    </button>
                  </article>
                ) : null}
              </div>

              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>SKU</th>
                      <th style={tableHeaderCellStyle}>Variant</th>
                      <th style={tableHeaderCellStyle}>Status</th>
                      <th style={tableHeaderCellStyle}>Barcode</th>
                      <th style={tableHeaderCellStyle}>Available</th>
                      <th style={tableHeaderCellStyle}>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productDetail.skus.map((sku) => (
                      <tr key={sku.id}>
                        <td style={tableCellStyle}>{sku.sku_code}</td>
                        <td style={tableCellStyle}>{sku.variant_label || 'No variant label'}</td>
                        <td style={tableCellStyle}>{sku.status}</td>
                        <td style={tableCellStyle}>{sku.barcode || '—'}</td>
                        <td style={tableCellStyle}>{Number(sku.available_qty ?? 0)}</td>
                        <td style={tableCellStyle}>{sku.sale_price ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <article style={{ ...cardStyle, padding: 14 }}>
                <h4 style={{ marginTop: 0 }}>Price Approval Queue</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(140px, 180px) auto', gap: 8, marginBottom: 12 }}>
                  <input value={priceRequestSearch} onChange={(event) => setPriceRequestSearch(event.target.value)} style={inputStyle} placeholder="Search product, SKU, variant, reason" />
                  <select value={priceRequestStatus} onChange={(event) => setPriceRequestStatus(event.target.value)} style={inputStyle}>
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button onClick={() => void refreshPriceRequests(1)} style={buttonStyle} disabled={loading}>Search</button>
                </div>
                {canApprovePriceChanges ? (
                  <textarea
                    value={approvalNote}
                    onChange={(event) => setApprovalNote(event.target.value)}
                    style={{ ...inputStyle, minHeight: 72, marginBottom: 12 }}
                    placeholder="Optional approval note"
                  />
                ) : null}
                {priceChangeRequests.length ? (
                  <>
                    <div style={tableWrapStyle}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={tableHeaderCellStyle}>Product</th>
                            <th style={tableHeaderCellStyle}>Sale</th>
                            <th style={tableHeaderCellStyle}>Cost</th>
                            <th style={tableHeaderCellStyle}>Compare</th>
                            <th style={tableHeaderCellStyle}>Status</th>
                            <th style={tableHeaderCellStyle}>Requested By</th>
                            <th style={tableHeaderCellStyle}>Reason</th>
                            <th style={tableHeaderCellStyle}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {priceChangeRequests.map((request) => (
                            <tr key={request.id}>
                              <td style={tableCellStyle}>
                                {request.product_name} · {request.sku_code}
                                {request.variant_label ? ` · ${request.variant_label}` : ''}
                              </td>
                              <td style={tableCellStyle}>{String(request.current_sale_price)} → {String(request.requested_sale_price)}</td>
                              <td style={tableCellStyle}>{request.current_cost_price ?? '—'} → {request.requested_cost_price ?? '—'}</td>
                              <td style={tableCellStyle}>{request.current_compare_at_price ?? '—'} → {request.requested_compare_at_price ?? '—'}</td>
                              <td style={tableCellStyle}>{request.status}</td>
                              <td style={tableCellStyle}>{request.requested_by_name || 'User'}</td>
                              <td style={tableCellStyle}>{request.reason}</td>
                              <td style={tableCellStyle}>
                                {canApprovePriceChanges && request.status === 'pending' ? (
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button onClick={() => decidePriceRequest(request.id, 'approve')} style={buttonStyle} disabled={loading}>Approve</button>
                                    <button onClick={() => decidePriceRequest(request.id, 'reject')} style={buttonStyle} disabled={loading}>Reject</button>
                                  </div>
                                ) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ListPager
                      loading={loading}
                      page={priceRequestPage}
                      pagination={priceRequestPagination}
                      label="request(s)"
                      onPrevious={() => void refreshPriceRequests(Math.max(1, priceRequestPage - 1))}
                      onNext={() => void refreshPriceRequests(Math.min(totalPagesFor(priceRequestPagination), priceRequestPage + 1))}
                    />
                  </>
                ) : (
                  <p style={{ marginBottom: 0, color: '#64748b' }}>No price requests yet.</p>
                )}
              </article>
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
