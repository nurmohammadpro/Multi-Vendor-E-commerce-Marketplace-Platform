'use client';

import { useEffect, useMemo, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { toast } from 'sonner';
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
import { searchRowStyle, stackedFilterGridStyle, useCompactLayout, WorkspaceTabs } from '../workspace-responsive';

type Category = { id: string; parent_id?: string | null; parent_name?: string | null; code: string; name: string; status: string };
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
type VariantRow = {
  key: string;
  label: string;
  skuCode: string;
  price: string;
  cost: string;
  barcode: string;
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

function formatQty(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return '0';
  return Number.isInteger(numeric) ? String(numeric) : String(numeric).replace(/\.?0+$/, '');
}

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
const searchActionStyle = searchButtonStyle;
const formActionStyle = accentButtonStyle;
const neutralActionStyle = secondaryButtonStyle;

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

const buildManualVariantSkuCode = (baseCode: string, label: string) =>
  sanitizeSkuToken([baseCode, label].filter(Boolean).join('-')).slice(0, 80);

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
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
  const compact = useCompactLayout();
  const [catalogTab, setCatalogTab] = useState<'quick' | 'products' | 'taxonomy' >('quick');
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Catalog workspace is ready.');

  const [categoryForm, setCategoryForm] = useState({ code: '', name: '', parentId: '' });
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [brandForm, setBrandForm] = useState({ name: '' });
  const [editingBrandId, setEditingBrandId] = useState('');
  const [productForm, setProductForm] = useState({
    productCode: '',
    name: '',
    description: '',
    categoryId: '',
    brandId: '',
    defaultSkuCode: '',
    defaultBarcode: '',
    defaultSalePrice: '',
    defaultCostPrice: '',
    hasVariants: false,
    variantMode: 'none',
    isTrackable: true,
    defaultDiscountType: '',
    defaultDiscountValue: '',
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
  const [productVariantRows, setProductVariantRows] = useState<VariantRow[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDescription, setConfirmDescription] = useState('');
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [quickVariantLabels, setQuickVariantLabels] = useState('');
  const [quickVariantSalePrice, setQuickVariantSalePrice] = useState('');
  const [quickVariantCostPrice, setQuickVariantCostPrice] = useState('');

  const parentMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) {
      if (c.parent_id) map[c.id] = categories.find((p) => p.id === c.parent_id)?.name ?? c.parent_id;
    }
    return map;
  }, [categories]);

  const hierarchicalCategories = useMemo(() => {
    const children = new Set<string>();
    for (const c of categories) {
      if (c.parent_id) children.add(c.parent_id);
    }
    const result: Category[] = [];
    const pushWithChildren = (parent: Category) => {
      result.push(parent);
      for (const c of categories) {
        if (c.parent_id === parent.id) {
          result.push(c);
        }
      }
    };
    for (const c of categories) {
      if (!c.parent_id) pushWithChildren(c);
    }
    // also include any orphaned children
    for (const c of categories) {
      if (c.parent_id && !categories.some((p) => p.id === c.parent_id)) {
        result.push(c);
      }
    }
    return result;
  }, [categories]);

  const parentOptions = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories],
  );

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

  useEffect(() => {
    if (!productForm.hasVariants || productVariantRows.length > 0 || editingProductId) return;
    setProductVariantRows([
      { key: String(Date.now()), label: '', skuCode: '', price: '', cost: '', barcode: generateBarcode() },
    ]);
  }, [editingProductId, productForm.hasVariants, productVariantRows.length]);

  const openDeleteConfirm = (kind: 'category' | 'brand' | 'product', id: string, name: string) => {
    setConfirmTitle(`Delete ${kind}`);
    setConfirmDescription(`Delete ${kind} "${name}"? This cannot be undone.`);
    setConfirmAction(() => async () => {
      setConfirmOpen(false);
      setLoading(true);
      try {
        const kindPath = kind === 'category' ? 'categories' : `${kind}s`;
        await readJson(`/api/catalog/${kindPath}/${id}`, { method: 'DELETE' });
        if (kind === 'product' && selectedProductId === id) {
          setSelectedProductId('');
          setProductDetail(null);
        }
        await refreshBase();
        setMessage(`${kind.charAt(0).toUpperCase() + kind.slice(1)} "${name}" deleted.`);
      } catch (error) {
        setMessage((error as Error).message);
      } finally {
        setLoading(false);
      }
    });
    setConfirmOpen(true);
  };

  const createCategory = async () => {
    if (!categoryForm.code || !categoryForm.name) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        code: categoryForm.code,
        name: categoryForm.name,
        status: 'active',
        sortOrder: 0,
      };
      if (categoryForm.parentId) body.parentId = categoryForm.parentId;
      if (editingCategoryId && categoryForm.parentId) body.parentId = categoryForm.parentId;
      else if (editingCategoryId && categoryForm.parentId === '') body.parentId = null;

      await readJson(editingCategoryId ? `/api/catalog/categories/${editingCategoryId}` : '/api/catalog/categories', {
        method: editingCategoryId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await refreshBase();
      setCategoryForm({ code: '', name: '', parentId: '' });
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

  const generateBarcode = () => {
    const ts = String(Date.now());
    const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `2${ts.slice(-9)}${rand}`;
  };

  const addProductVariantRow = () => {
    setProductVariantRows((current) => [
      ...current,
      { key: String(Date.now()), label: '', skuCode: '', price: '', cost: '', barcode: generateBarcode() },
    ]);
  };

  const removeProductVariantRow = (key: string) => {
    setProductVariantRows((current) => current.filter((row) => row.key !== key));
  };

  const updateProductVariantRow = (key: string, field: keyof VariantRow, value: string) => {
    setProductVariantRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  };

  const resetProductBuilder = () => {
    setProductForm({
      productCode: '',
      name: '',
      description: '',
      categoryId: '',
      brandId: '',
      defaultSkuCode: '',
      defaultBarcode: '',
      defaultSalePrice: '',
      defaultCostPrice: '',
      hasVariants: false,
      variantMode: 'none',
      isTrackable: true,
      defaultDiscountType: '',
      defaultDiscountValue: '',
    });
    setProductVariantRows([]);
    setQuickVariantLabels('');
    setQuickVariantSalePrice('');
    setQuickVariantCostPrice('');
    setEditingProductId('');
  };

  const buildSuggestedProductCode = (name: string) => sanitizeSkuToken(name).slice(0, 32);

  const ensureProductCode = () => {
    if (productForm.productCode.trim() || !productForm.name.trim()) return;
    const suggested = buildSuggestedProductCode(productForm.name);
    setProductForm((current) => ({
      ...current,
      productCode: suggested,
      defaultSkuCode: current.hasVariants ? current.defaultSkuCode : current.defaultSkuCode || suggested,
    }));
  };

  const addQuickVariantRows = () => {
    const labels = Array.from(
      new Set(
        quickVariantLabels
          .split(/\n|,/)
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );

    if (!labels.length) {
      setMessage('Add one or more variant labels first.');
      return;
    }

    setProductVariantRows((current) => {
      const existingLabels = new Set(current.map((row) => row.label.trim().toLowerCase()));
      return [
        ...current,
        ...labels
          .filter((label) => !existingLabels.has(label.toLowerCase()))
          .map((label) => ({
            key: `${Date.now()}-${label}`,
            label,
            skuCode: buildManualVariantSkuCode(productForm.productCode || productForm.name || 'SKU', label),
            price: quickVariantSalePrice,
            cost: quickVariantCostPrice,
            barcode: generateBarcode(),
          })),
      ];
    });

    setQuickVariantLabels('');
    setMessage(`Added ${labels.length} quick variant row(s).`);
  };

  const createProduct = async () => {
    if (!productForm.name) return;
    const normalizedProductCode = productForm.productCode.trim() || buildSuggestedProductCode(productForm.name);
    if (!normalizedProductCode) return;
    setLoading(true);
    try {
      const payload = await readJson<{ product?: { id: string }; id?: string }>(
        editingProductId
          ? `/api/catalog/products/${editingProductId}`
          : '/api/catalog/products',
        {
          method: editingProductId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productCode: normalizedProductCode,
            name: productForm.name,
            description: productForm.description || undefined,
            categoryId: productForm.categoryId || undefined,
            brandId: productForm.brandId || undefined,
            status: 'active',
            isTrackable: productForm.isTrackable,
            hasVariants: productForm.hasVariants,
            variantMode: productForm.hasVariants ? productForm.variantMode : 'none',
          }),
        },
      );

      const newProductId = payload?.product?.id || payload?.id;

      if (!editingProductId && newProductId) {
        const liveRows = productVariantRows
          .map((row) => ({
            ...row,
            skuCode: row.skuCode.trim() || buildManualVariantSkuCode(normalizedProductCode, row.label),
          }))
          .filter((row) => row.skuCode.trim());

        const discountPayload: Record<string, unknown> = {};
        if (productForm.defaultDiscountType) {
          discountPayload.discountType = productForm.defaultDiscountType;
          discountPayload.discountValue = productForm.defaultDiscountValue ? Number(productForm.defaultDiscountValue) : null;
        }

        if (!productForm.hasVariants) {
          await readJson('/api/catalog/skus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: newProductId,
              skuCode: productForm.defaultSkuCode.trim() || sanitizeSkuToken(normalizedProductCode),
              barcode: productForm.defaultBarcode || undefined,
              status: 'active',
              salePrice: productForm.defaultSalePrice ? Number(productForm.defaultSalePrice) : undefined,
              costPrice: productForm.defaultCostPrice ? Number(productForm.defaultCostPrice) : undefined,
              ...discountPayload,
            }),
          });
        }

        for (const row of liveRows) {
          await readJson('/api/catalog/skus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: newProductId,
              skuCode: row.skuCode,
              barcode: row.barcode || undefined,
              variantLabel: row.label || undefined,
              status: 'active',
              salePrice: row.price ? Number(row.price) : undefined,
              costPrice: row.cost ? Number(row.cost) : undefined,
              ...discountPayload,
            }),
          });
        }
      }

      await refreshBase();
      resetProductBuilder();
      const variantCount = productVariantRows.filter((r) => r.skuCode.trim()).length;
      setMessage(
        editingProductId
          ? 'Product updated.'
          : variantCount > 0
            ? `Product created with ${variantCount} variant(s).`
            : 'Product created.',
      );
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
        barcode: generateBarcode(),
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
        <WorkspaceTabs
          active={catalogTab}
          onChange={(key) => setCatalogTab(key as 'quick' | 'products' | 'taxonomy' )}
          tabs={[
            { key: 'quick', label: 'Quick Entry' },
            { key: 'products', label: 'Products' },
            { key: 'taxonomy', label: 'Categories & Brands' },
            
          ]}
        />
      ) : null}

      {canManageCatalog && catalogTab === 'quick' ? (
        <section style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.35fr) minmax(320px, 0.65fr)', gap: 16 }}>
          <article style={cardStyle}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 4 }}>New Product</h3>
                <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>Name the product, choose type, add variants. SKU auto-generates from name.</p>
              </div>

              {/* Product name */}
              <input
                value={productForm.name}
                onChange={(e) => setProductForm((v) => ({ ...v, name: e.target.value }))}
                onBlur={ensureProductCode}
                style={inputStyle}
                placeholder="Product name"
              />

              {/* Classification */}
              <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 10 }}>
                <select value={productForm.categoryId} onChange={(e) => setProductForm((v) => ({ ...v, categoryId: e.target.value }))} style={inputStyle}>
                  <option value="">No category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={productForm.brandId} onChange={(e) => setProductForm((v) => ({ ...v, brandId: e.target.value }))} style={inputStyle}>
                  <option value="">No brand</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {/* Product type toggle */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setProductForm((v) => ({ ...v, hasVariants: false, variantMode: 'none' }))}
                  style={{ ...neutralActionStyle, background: !productForm.hasVariants ? 'var(--muted)' : 'var(--card)', borderColor: !productForm.hasVariants ? 'var(--foreground)' : undefined }}
                  disabled={loading}
                >
                  Simple Product
                </button>
                <button
                  onClick={() => setProductForm((v) => ({ ...v, hasVariants: true, variantMode: v.variantMode === 'none' ? 'single' : v.variantMode }))}
                  style={{ ...neutralActionStyle, background: productForm.hasVariants ? 'var(--muted)' : 'var(--card)', borderColor: productForm.hasVariants ? 'var(--foreground)' : undefined }}
                  disabled={loading}
                >
                  With Variants
                </button>
              </div>

              {/* Simple product — SKU + pricing */}
              {!productForm.hasVariants ? (
                <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(2, 1fr)', gap: 10 }}>
                  <input value={productForm.defaultSkuCode} onChange={(e) => setProductForm((v) => ({ ...v, defaultSkuCode: e.target.value }))} style={inputStyle} placeholder={sanitizeSkuToken(productForm.productCode || productForm.name || 'SKU')} />
                  <input value={productForm.defaultBarcode} onChange={(e) => setProductForm((v) => ({ ...v, defaultBarcode: e.target.value }))} style={inputStyle} placeholder="Barcode (optional)" />
                  <input value={productForm.defaultSalePrice} onChange={(e) => setProductForm((v) => ({ ...v, defaultSalePrice: e.target.value }))} style={inputStyle} placeholder="Sale price" />
                  <input value={productForm.defaultCostPrice} onChange={(e) => setProductForm((v) => ({ ...v, defaultCostPrice: e.target.value }))} style={inputStyle} placeholder="Cost price" />
                </div>
              ) : null}

              {/* Variant entries */}
              {productForm.hasVariants ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ ...surfaceCardStyle, padding: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>Add variants — one per line</div>
                    <textarea
                      value={quickVariantLabels}
                      onChange={(e) => setQuickVariantLabels(e.target.value)}
                      style={{ ...inputStyle, minHeight: 72 }}
                      placeholder={'90/90-12\n100/80-17\nRed\nBlue'}
                    />
                    <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                      <input value={quickVariantSalePrice} onChange={(e) => setQuickVariantSalePrice(e.target.value)} style={{ ...inputStyle, width: 120 }} placeholder="Sale price for all" />
                      <input value={quickVariantCostPrice} onChange={(e) => setQuickVariantCostPrice(e.target.value)} style={{ ...inputStyle, width: 120 }} placeholder="Cost price for all" />
                      <button onClick={addQuickVariantRows} style={accentButtonStyle} disabled={loading}>Add Variant Rows</button>
                    </div>
                  </div>

                  {productVariantRows.length ? (
                    <div style={tableWrapStyle}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={tableHeaderCellStyle}>Variant Label</th>
                            <th style={tableHeaderCellStyle}>SKU (auto)</th>
                            <th style={tableHeaderCellStyle}>Price</th>
                            <th style={tableHeaderCellStyle}>Cost</th>
                            <th style={tableHeaderCellStyle}>Barcode</th>
                            <th style={tableHeaderCellStyle}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {productVariantRows.map((row) => (
                            <tr key={row.key}>
                              <td style={tableCellStyle}>
                                <input value={row.label} onChange={(e) => setProductVariantRows((cur) => cur.map((r) => r.key === row.key ? { ...r, label: e.target.value, skuCode: e.target.value ? buildManualVariantSkuCode(productForm.productCode || productForm.name || 'SKU', e.target.value) : r.skuCode } : r))} style={{ ...inputStyle, width: '100%' }} placeholder="e.g. 90/90-12" />
                              </td>
                              <td style={{ ...tableCellStyle, fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{row.skuCode}</td>
                              <td style={tableCellStyle}>
                                <input value={row.price} onChange={(e) => setProductVariantRows((cur) => cur.map((r) => r.key === row.key ? { ...r, price: e.target.value } : r))} style={{ ...inputStyle, width: 90 }} placeholder="0.00" />
                              </td>
                              <td style={tableCellStyle}>
                                <input value={row.cost} onChange={(e) => setProductVariantRows((cur) => cur.map((r) => r.key === row.key ? { ...r, cost: e.target.value } : r))} style={{ ...inputStyle, width: 90 }} placeholder="0.00" />
                              </td>
                              <td style={tableCellStyle}>
                                <input value={row.barcode} onChange={(e) => setProductVariantRows((cur) => cur.map((r) => r.key === row.key ? { ...r, barcode: e.target.value } : r))} style={{ ...inputStyle, width: 120 }} placeholder="Barcode" />
                              </td>
                              <td style={tableCellStyle}>
                                <button onClick={() => setProductVariantRows((cur) => cur.filter((r) => r.key !== row.key))} style={dangerButtonStyle}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Create */}
              <button onClick={createProduct} style={{ ...accentButtonStyle, minHeight: 36, width: '100%' }} disabled={loading || !productForm.name}>
                {editingProductId ? 'Update Product' : 'Create Product'}
              </button>
            </div>
          </article>

          {/* Review panel — recent products */}
          <article style={{ ...cardStyle, padding: 14 }}>
            <h4 style={{ marginTop: 0 }}>Recent Products</h4>
            <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Recently created products and their SKU codes.</p>
            {products.length ? (
              <div style={{ ...tableWrapStyle, marginTop: 10 }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Product</th>
                      <th style={tableHeaderCellStyle}>SKUs</th>
                      <th style={tableHeaderCellStyle}>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, 10).map((product) => (
                      <tr key={product.id}>
                        <td style={tableCellStyle}>
                          <div style={{ fontWeight: 600 }}>{product.name}</div>
                          {product.category_name ? <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{product.category_name}</div> : null}
                        </td>
                        <td style={tableCellStyle}>{product.sku_count}</td>
                        <td style={tableCellStyle}>{product.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ ...emptyStateStyle, marginTop: 10 }}>No products yet. Create your first product.</div>
            )}
          </article>
        </section>
      ) : null}

      {(!canManageCatalog || catalogTab === 'products') ? (
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {false ? (
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Products</h3>
          <div style={{ ...searchRowStyle, marginBottom: 12 }}>
            <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} style={{ ...inputStyle, flex: 1, width: 'auto' }} placeholder="Search product, code, category, brand" />
            <select value={productStatus} onChange={(event) => setProductStatus(event.target.value)} style={{ ...inputStyle, width: 160 }}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
            <button onClick={() => void refreshBase(categoryPage, brandPage, 1)} style={searchButtonStyle} disabled={loading}>Search</button>
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
                        onClick={() => {
                          setSelectedProductId(product.id);
                          if (canManageCatalog) setCatalogTab('products');
                        }}
                        style={{ cursor: 'pointer', background: selectedProductId === product.id ? 'var(--muted)' : 'var(--card)' }}
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
                                setCatalogTab('quick');
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
                              style={subtleButtonStyle}
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
                              style={subtleButtonStyle}
                            >
                              {product.status === 'archived' ? 'Activate' : 'Archive'}
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                openDeleteConfirm('product', product.id, product.name);
                              }}
                              style={dangerButtonStyle}
                            >
                              Delete
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
        ) : null}

        {catalogTab !== 'products' || !canManageCatalog ? (
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Advanced Variant Builder</h3>
          {!productDetail ? (
            <p style={{ marginBottom: 0, color: 'var(--muted-foreground)' }}>Select a product only if you need deeper group, option, matrix, or manual SKU control.</p>
          ) : (
            <section style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{productDetail.product.name}</div>
                <div style={{ color: 'var(--muted-foreground)' }}>
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
                    <button onClick={createVariantGroup} style={formActionStyle} disabled={loading}>{editingGroupId ? 'Save Group' : 'Add Group'}</button>
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
                    <button onClick={createVariantOption} style={formActionStyle} disabled={loading}>{editingOptionId ? 'Save Option' : 'Add Option'}</button>
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
                              style={subtleButtonStyle}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => void readJson(`/api/catalog/variant-groups/${group.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: group.status === 'inactive' ? 'active' : 'inactive' }),
                              }).then(() => refreshDetail(selectedProductId)).then(() => setMessage(`Variant group ${group.status === 'inactive' ? 'activated' : 'archived'}.`)).catch((error: Error) => setMessage(error.message))}
                              style={subtleButtonStyle}
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
                                style={subtleButtonStyle}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => void readJson(`/api/catalog/variant-options/${option.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: option.status === 'inactive' ? 'active' : 'inactive' }),
                                }).then(() => refreshDetail(selectedProductId)).then(() => setMessage(`Variant option ${option.status === 'inactive' ? 'activated' : 'archived'}.`)).catch((error: Error) => setMessage(error.message))}
                                style={subtleButtonStyle}
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
                  <p style={{ marginTop: 0, color: 'var(--muted-foreground)' }}>
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
                              style={neutralActionStyle}
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
                              style={neutralActionStyle}
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
                                  border: checked ? '1px solid var(--accent)' : '1px solid var(--border)',
                                  background: checked ? 'var(--accent-soft)' : 'var(--card)',
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

                  <div style={{ ...stackedFilterGridStyle, marginTop: 14 }}>
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
                    <button onClick={buildVariantMatrix} style={neutralActionStyle} disabled={loading}>
                      Build Matrix
                    </button>
                    <button onClick={createVariantRows} style={formActionStyle} disabled={loading || variantRows.length === 0}>
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
                                <div style={{ color: 'var(--muted-foreground)', marginTop: 4 }}>{row.variantOptionIds.length} option(s)</div>
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
                    <button onClick={createSku} style={formActionStyle} disabled={loading}>Create SKU</button>
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
                      <div style={{ marginBottom: 10, color: 'var(--muted-foreground)', fontSize: 14 }}>
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
                      style={formActionStyle}
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
                        <td style={tableCellStyle}>{formatQty(sku.available_qty)}</td>
                        <td style={tableCellStyle}>{sku.sale_price ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <article style={{ ...cardStyle, padding: 14 }}>
                <h4 style={{ marginTop: 0 }}>Price Approval Queue</h4>
                <div style={{ ...searchRowStyle, marginBottom: 12 }}>
                  <input value={priceRequestSearch} onChange={(event) => setPriceRequestSearch(event.target.value)} style={{ ...inputStyle, flex: 1, width: 'auto' }} placeholder="Search product, SKU, variant, reason" />
                  <select value={priceRequestStatus} onChange={(event) => setPriceRequestStatus(event.target.value)} style={{ ...inputStyle, width: 160 }}>
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button onClick={() => void refreshPriceRequests(1)} style={searchActionStyle} disabled={loading}>Search</button>
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
                                    <button onClick={() => decidePriceRequest(request.id, 'approve')} style={accentButtonStyle} disabled={loading}>Approve</button>
                                    <button onClick={() => decidePriceRequest(request.id, 'reject')} style={dangerButtonStyle} disabled={loading}>Reject</button>
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
                  <p style={{ marginBottom: 0, color: 'var(--muted-foreground)' }}>No price requests yet.</p>
                )}
              </article>
            </section>
          )}
        </article>
        ) : null}
      </section>
      ) : null}

      <article style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={{ marginBottom: 0, color: 'var(--muted-foreground)' }}>{message}</p>
      </article>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        onAction={confirmAction}
      />
    </section>
  );
}
