import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { normalizePageQuery, stripPaginationTotal } from '../common/pagination.js';
import { DATABASE_POOL } from '../database/database.constants.js';

type VariantOptionRow = {
  variant_group_id: string;
  variant_group_name: string;
  variant_group_code: string;
  group_sort_order: number;
  option_id: string;
  option_label: string;
  option_code: string;
  option_sort_order: number;
  status: string;
};

type LatestPriceRow = {
  id: string;
  cost_price: string | null;
  sale_price: string;
  compare_at_price: string | null;
  effective_from: string;
  effective_to: string | null;
};

@Injectable()
export class CatalogService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listCategories(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;

    const result = await this.pool.query(
      `
        select *
        from (
          select
            id,
            parent_id,
            code,
            name,
            name_bn,
            status,
            sort_order,
            created_at,
            updated_at,
            count(*) over()::int as total_count
          from catalog.categories
          where tenant_id = (
            select tenant_id from store.stores where id = $1
          )
            and (
              $2::text is null
              or code ilike '%' || $2::text || '%'
              or name ilike '%' || $2::text || '%'
              or coalesce(name_bn, '') ilike '%' || $2::text || '%'
            )
          order by sort_order asc, created_at asc
          limit $3
          offset $4
        ) categories
      `,
      [storeId, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { categories: items, pagination: { page, limit, total } };
  }

  async createCategory(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      parentId?: string;
      code: string;
      name: string;
      nameBn?: string;
      status: 'active' | 'inactive';
      sortOrder: number;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        insert into catalog.categories (
          id,
          tenant_id,
          parent_id,
          code,
          name,
          name_bn,
          status,
          sort_order,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          s.tenant_id,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          now(),
          now()
        from store.stores s
        where s.id = $1
        returning id, parent_id, code, name, name_bn, status, sort_order
      `,
      [storeId, payload.parentId ?? null, payload.code, payload.name, payload.nameBn ?? null, payload.status, payload.sortOrder],
    );

    return { category: result.rows[0] };
  }

  async listBrands(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;

    const result = await this.pool.query(
      `
        select *
        from (
          select
            id,
            name,
            name_bn,
            status,
            created_at,
            updated_at,
            count(*) over()::int as total_count
          from catalog.brands
          where tenant_id = (
            select tenant_id from store.stores where id = $1
          )
            and (
              $2::text is null
              or name ilike '%' || $2::text || '%'
              or coalesce(name_bn, '') ilike '%' || $2::text || '%'
            )
          order by name asc
          limit $3
          offset $4
        ) brands
      `,
      [storeId, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { brands: items, pagination: { page, limit, total } };
  }

  async createBrand(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      name: string;
      nameBn?: string;
      status: 'active' | 'inactive';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        insert into catalog.brands (
          id,
          tenant_id,
          name,
          name_bn,
          status,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          s.tenant_id,
          $2,
          $3,
          $4,
          now(),
          now()
        from store.stores s
        where s.id = $1
        returning id, name, name_bn, status
      `,
      [storeId, payload.name, payload.nameBn ?? null, payload.status],
    );

    return { brand: result.rows[0] };
  }

  async searchSkus(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      query?: string;
      barcode?: string;
      limit?: number;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const normalizedLimit = Math.max(1, Math.min(payload.limit ?? 25, 100));

    const result = await this.pool.query(
      `
        with latest_prices as (
          select distinct on (pr.sku_id)
            pr.sku_id,
            pr.cost_price,
            pr.sale_price,
            pr.compare_at_price,
            pr.effective_from,
            pr.effective_to
          from catalog.prices pr
          join catalog.skus sku on sku.id = pr.sku_id
          where sku.store_id = $1
          order by pr.sku_id, pr.effective_from desc, pr.created_at desc
        ),
        stock_totals as (
          select
            b.sku_id,
            coalesce(sum(b.on_hand_qty), 0) as on_hand_qty,
            coalesce(sum(b.available_qty), 0) as available_qty
          from inventory.balances b
          where b.store_id = $1
          group by b.sku_id
        )
        select
          sku.id,
          sku.product_id,
          sku.sku_code,
          sku.barcode,
          sku.variant_label,
          sku.variant_json,
          sku.unit_name,
          sku.weight_value,
          sku.weight_unit,
          sku.status,
          p.product_code,
          p.name as product_name,
          p.name_bn as product_name_bn,
          p.has_variants,
          p.variant_mode,
          b.name as brand_name,
          c.name as category_name,
          lp.cost_price,
          lp.sale_price,
          lp.compare_at_price,
          st.on_hand_qty,
          st.available_qty
        from catalog.skus sku
        join catalog.products p on p.id = sku.product_id
        left join catalog.brands b on b.id = p.brand_id
        left join catalog.categories c on c.id = p.category_id
        left join latest_prices lp on lp.sku_id = sku.id
        left join stock_totals st on st.sku_id = sku.id
        where sku.store_id = $1
          and sku.status = 'active'
          and (
            $2::varchar is null
            or sku.barcode = $2::varchar
          )
          and (
            ($3::text is null and $2::varchar is not null)
            or $3::text is null
            or p.name ilike '%' || $3::text || '%'
            or sku.sku_code ilike '%' || $3::text || '%'
            or coalesce(sku.barcode, '') ilike '%' || $3::text || '%'
            or coalesce(sku.variant_label, '') ilike '%' || $3::text || '%'
            or coalesce(b.name, '') ilike '%' || $3::text || '%'
          )
        order by
          case when $2::varchar is not null and sku.barcode = $2::varchar then 0 else 1 end,
          p.name asc,
          sku.variant_label asc nulls first,
          sku.created_at asc
        limit $4
      `,
      [storeId, payload.barcode ?? null, payload.query ?? null, normalizedLimit],
    );

    return {
      skus: result.rows,
    };
  }

  async listProducts(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { status?: string; search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;

    const result = await this.pool.query(
      `
        select *
        from (
          select
            p.id,
            p.product_code,
            p.name,
            p.name_bn,
            p.status,
            p.is_trackable,
            p.has_variants,
            p.variant_mode,
            p.created_at,
            p.updated_at,
            c.name as category_name,
            b.name as brand_name,
            coalesce(count(s.id), 0)::int as sku_count,
            count(*) over()::int as total_count
          from catalog.products p
          left join catalog.categories c on c.id = p.category_id
          left join catalog.brands b on b.id = p.brand_id
          left join catalog.skus s on s.product_id = p.id
          where p.store_id = $1
            and ($2::text is null or p.status = $2::text)
            and (
              $3::text is null
              or p.product_code ilike '%' || $3::text || '%'
              or p.name ilike '%' || $3::text || '%'
              or coalesce(p.name_bn, '') ilike '%' || $3::text || '%'
              or coalesce(c.name, '') ilike '%' || $3::text || '%'
              or coalesce(b.name, '') ilike '%' || $3::text || '%'
            )
          group by p.id, c.name, b.name
          order by p.created_at desc
          limit $4
          offset $5
        ) products
      `,
      [storeId, filters.status ?? null, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return {
      products: items,
      pagination: { page, limit, total },
    };
  }

  async getProduct(
    productId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const productResult = await this.pool.query(
      `
        select
          p.id,
          p.product_code,
          p.name,
          p.name_bn,
          p.description,
          p.status,
          p.is_trackable,
          p.has_variants,
          p.variant_mode,
          p.created_at,
          p.updated_at,
          c.id as category_id,
          c.name as category_name,
          b.id as brand_id,
          b.name as brand_name
        from catalog.products p
        left join catalog.categories c on c.id = p.category_id
        left join catalog.brands b on b.id = p.brand_id
        where p.id = $1
          and p.store_id = $2
        limit 1
      `,
      [productId, storeId],
    );

    const product = productResult.rows[0];
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const groupsResult = await this.pool.query(
      `
        select
          vg.id,
          vg.code,
          vg.name,
          vg.input_type,
          vg.sort_order,
          vg.is_required,
          vg.status,
          coalesce(
            json_agg(
              json_build_object(
                'id', vo.id,
                'code', vo.code,
                'label', vo.label,
                'valueText', vo.value_text,
                'valueNumber', vo.value_number,
                'colorHex', vo.color_hex,
                'sortOrder', vo.sort_order,
                'status', vo.status
              )
              order by vo.sort_order asc, vo.created_at asc
            ) filter (where vo.id is not null),
            '[]'::json
          ) as options
        from catalog.product_variant_groups vg
        left join catalog.product_variant_options vo on vo.variant_group_id = vg.id
        where vg.product_id = $1
          and vg.store_id = $2
        group by vg.id
        order by vg.sort_order asc, vg.created_at asc
      `,
      [productId, storeId],
    );

    const skuResult = await this.pool.query(
      `
        with latest_prices as (
          select distinct on (pr.sku_id)
            pr.sku_id,
            pr.cost_price,
            pr.sale_price,
            pr.compare_at_price,
            pr.effective_from,
            pr.effective_to
          from catalog.prices pr
          where pr.sku_id in (
            select id from catalog.skus where product_id = $1 and store_id = $2
          )
          order by pr.sku_id, pr.effective_from desc, pr.created_at desc
        ),
        stock_totals as (
          select
            b.sku_id,
            coalesce(sum(b.on_hand_qty), 0) as on_hand_qty,
            coalesce(sum(b.available_qty), 0) as available_qty
          from inventory.balances b
          where b.store_id = $2
            and b.sku_id in (
              select id from catalog.skus where product_id = $1 and store_id = $2
            )
          group by b.sku_id
        )
        select
          sku.id,
          sku.sku_code,
          sku.barcode,
          sku.variant_label,
          sku.variant_json,
          sku.unit_name,
          sku.weight_value,
          sku.weight_unit,
          sku.status,
          lp.cost_price,
          lp.sale_price,
          lp.compare_at_price,
          st.on_hand_qty,
          st.available_qty
        from catalog.skus sku
        left join latest_prices lp on lp.sku_id = sku.id
        left join stock_totals st on st.sku_id = sku.id
        where sku.product_id = $1
          and sku.store_id = $2
        order by sku.created_at asc
      `,
      [productId, storeId],
    );

    return {
      product,
      groups: groupsResult.rows,
      skus: skuResult.rows,
    };
  }

  async createProduct(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      categoryId?: string;
      brandId?: string;
      productCode: string;
      name: string;
      nameBn?: string;
      description?: string;
      status: string;
      isTrackable: boolean;
      hasVariants: boolean;
      variantMode: 'none' | 'single' | 'multi';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    this.assertVariantModeConsistency(payload.hasVariants, payload.variantMode);

    const result = await this.pool.query(
      `
        insert into catalog.products (
          id,
          tenant_id,
          store_id,
          category_id,
          brand_id,
          product_code,
          name,
          name_bn,
          description,
          status,
          is_trackable,
          has_variants,
          variant_mode,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          s.tenant_id,
          s.id,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $12,
          now(),
          now()
        from store.stores s
        where s.id = $1
        returning id, product_code, name, status, is_trackable, has_variants, variant_mode, created_at
      `,
      [
        storeId,
        payload.categoryId ?? null,
        payload.brandId ?? null,
        payload.productCode,
        payload.name,
        payload.nameBn ?? null,
        payload.description ?? null,
        payload.status,
        payload.isTrackable,
        payload.hasVariants,
        payload.variantMode,
        userId,
      ],
    );

    return {
      product: result.rows[0],
    };
  }

  async updateProduct(
    productId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      categoryId?: string | null;
      brandId?: string | null;
      name?: string;
      nameBn?: string | null;
      description?: string | null;
      status?: string;
      isTrackable?: boolean;
      hasVariants?: boolean;
      variantMode?: 'none' | 'single' | 'multi';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const currentProduct = await this.pool.query<{
      has_variants: boolean;
      variant_mode: 'none' | 'single' | 'multi';
    }>(
      `
        select has_variants, variant_mode
        from catalog.products
        where id = $1
          and store_id = $2
        limit 1
      `,
      [productId, storeId],
    );

    const productRow = currentProduct.rows[0];
    if (!productRow) {
      throw new NotFoundException('Product not found');
    }

    const hasVariants = payload.hasVariants ?? productRow.has_variants;
    const variantMode = payload.variantMode ?? productRow.variant_mode;
    this.assertVariantModeConsistency(hasVariants, variantMode);

    const result = await this.pool.query(
      `
        update catalog.products
        set
          category_id = coalesce($3, category_id),
          brand_id = coalesce($4, brand_id),
          name = coalesce($5, name),
          name_bn = case when $6::text is null then name_bn else $6 end,
          description = case when $7::text is null then description else $7 end,
          status = coalesce($8, status),
          is_trackable = coalesce($9, is_trackable),
          has_variants = $10,
          variant_mode = $11,
          updated_by = $12,
          updated_at = now()
        where id = $1
          and store_id = $2
        returning id, product_code, name, status, has_variants, variant_mode, updated_at
      `,
      [
        productId,
        storeId,
        payload.categoryId === undefined ? null : payload.categoryId,
        payload.brandId === undefined ? null : payload.brandId,
        payload.name ?? null,
        payload.nameBn === undefined ? null : payload.nameBn,
        payload.description === undefined ? null : payload.description,
        payload.status ?? null,
        payload.isTrackable ?? null,
        hasVariants,
        variantMode,
        userId,
      ],
    );

    return { product: result.rows[0] };
  }

  async getProductVariants(
    productId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const productResult = await this.pool.query(
      `
        select id, product_code, name, has_variants, variant_mode, status
        from catalog.products
        where id = $1
          and store_id = $2
        limit 1
      `,
      [productId, storeId],
    );

    const product = productResult.rows[0];
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const groupsResult = await this.pool.query(
      `
        select
          vg.id,
          vg.code,
          vg.name,
          vg.input_type,
          vg.sort_order,
          vg.is_required,
          vg.status,
          coalesce(
            json_agg(
              json_build_object(
                'id', vo.id,
                'code', vo.code,
                'label', vo.label,
                'valueText', vo.value_text,
                'valueNumber', vo.value_number,
                'colorHex', vo.color_hex,
                'sortOrder', vo.sort_order,
                'status', vo.status
              )
              order by vo.sort_order asc, vo.created_at asc
            ) filter (where vo.id is not null),
            '[]'::json
          ) as options
        from catalog.product_variant_groups vg
        left join catalog.product_variant_options vo on vo.variant_group_id = vg.id
        where vg.product_id = $1
          and vg.store_id = $2
        group by vg.id
        order by vg.sort_order asc, vg.created_at asc
      `,
      [productId, storeId],
    );

    const skusResult = await this.pool.query(
      `
        select
          s.id,
          s.sku_code,
          s.barcode,
          s.variant_label,
          s.variant_json,
          s.status
        from catalog.skus s
        where s.product_id = $1
          and s.store_id = $2
        order by s.created_at asc
      `,
      [productId, storeId],
    );

    return {
      product,
      groups: groupsResult.rows,
      skus: skusResult.rows,
    };
  }

  async createVariantGroup(
    productId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      code: string;
      name: string;
      inputType: 'text' | 'color' | 'number';
      sortOrder: number;
      isRequired: boolean;
      status: 'active' | 'inactive';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        insert into catalog.product_variant_groups (
          id,
          tenant_id,
          store_id,
          product_id,
          code,
          name,
          input_type,
          sort_order,
          is_required,
          status,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          p.tenant_id,
          p.store_id,
          p.id,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          now(),
          now()
        from catalog.products p
        where p.id = $1
          and p.store_id = $8
        returning id, product_id, code, name, input_type, sort_order, is_required, status
      `,
      [
        productId,
        payload.code,
        payload.name,
        payload.inputType,
        payload.sortOrder,
        payload.isRequired,
        payload.status,
        storeId,
      ],
    );

    const group = result.rows[0];
    if (!group) {
      throw new NotFoundException('Product not found');
    }

    await this.touchProductVariantMode(productId, storeId);
    return { group };
  }

  async updateVariantGroup(
    variantGroupId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      name?: string;
      inputType?: 'text' | 'color' | 'number';
      sortOrder?: number;
      isRequired?: boolean;
      status?: 'active' | 'inactive';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        update catalog.product_variant_groups
        set
          name = coalesce($3, name),
          input_type = coalesce($4, input_type),
          sort_order = coalesce($5, sort_order),
          is_required = coalesce($6, is_required),
          status = coalesce($7, status),
          updated_at = now()
        where id = $1
          and store_id = $2
        returning id, product_id, code, name, input_type, sort_order, is_required, status
      `,
      [
        variantGroupId,
        storeId,
        payload.name ?? null,
        payload.inputType ?? null,
        payload.sortOrder ?? null,
        payload.isRequired ?? null,
        payload.status ?? null,
      ],
    );

    const group = result.rows[0];
    if (!group) {
      throw new NotFoundException('Variant group not found');
    }

    return { group };
  }

  async createVariantOption(
    productId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      variantGroupId: string;
      code: string;
      label: string;
      valueText?: string;
      valueNumber?: number;
      colorHex?: string;
      sortOrder: number;
      status: 'active' | 'inactive';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const groupResult = await this.pool.query(
      `
        select id
        from catalog.product_variant_groups
        where id = $1
          and product_id = $2
          and store_id = $3
        limit 1
      `,
      [payload.variantGroupId, productId, storeId],
    );

    if (!groupResult.rows[0]) {
      throw new NotFoundException('Variant group not found');
    }

    const result = await this.pool.query(
      `
        insert into catalog.product_variant_options (
          id,
          tenant_id,
          store_id,
          product_id,
          variant_group_id,
          code,
          label,
          value_text,
          value_number,
          color_hex,
          sort_order,
          status,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          p.tenant_id,
          p.store_id,
          p.id,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          now(),
          now()
        from catalog.products p
        where p.id = $1
          and p.store_id = $10
        returning id, variant_group_id, code, label, value_text, value_number, color_hex, sort_order, status
      `,
      [
        productId,
        payload.variantGroupId,
        payload.code,
        payload.label,
        payload.valueText ?? null,
        payload.valueNumber ?? null,
        payload.colorHex ?? null,
        payload.sortOrder,
        payload.status,
        storeId,
      ],
    );

    const option = result.rows[0];
    if (!option) {
      throw new NotFoundException('Product not found');
    }

    return { option };
  }

  async updateVariantOption(
    variantOptionId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      label?: string;
      valueText?: string | null;
      valueNumber?: number | null;
      colorHex?: string | null;
      sortOrder?: number;
      status?: 'active' | 'inactive';
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        update catalog.product_variant_options
        set
          label = coalesce($3, label),
          value_text = case when $4::text is null then value_text else $4 end,
          value_number = case when $5::numeric is null then value_number else $5 end,
          color_hex = case when $6::text is null then color_hex else $6 end,
          sort_order = coalesce($7, sort_order),
          status = coalesce($8, status),
          updated_at = now()
        where id = $1
          and store_id = $2
        returning id, variant_group_id, code, label, value_text, value_number, color_hex, sort_order, status
      `,
      [
        variantOptionId,
        storeId,
        payload.label ?? null,
        payload.valueText === undefined ? null : payload.valueText,
        payload.valueNumber === undefined ? null : payload.valueNumber,
        payload.colorHex === undefined ? null : payload.colorHex,
        payload.sortOrder ?? null,
        payload.status ?? null,
      ],
    );

    const option = result.rows[0];
    if (!option) {
      throw new NotFoundException('Variant option not found');
    }

    return { option };
  }

  async addProductMedia(
    productId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      mediaType: 'image' | 'document';
      storagePath: string;
      isPrimary: boolean;
      sortOrder: number;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);

    const result = await this.pool.query(
      `
        insert into catalog.product_media (
          id,
          tenant_id,
          product_id,
          media_type,
          storage_path,
          is_primary,
          sort_order,
          created_at
        )
        select
          gen_random_uuid(),
          p.tenant_id,
          p.id,
          $2,
          $3,
          $4,
          $5,
          now()
        from catalog.products p
        where p.id = $1
          and p.store_id = $6
        returning id, product_id, media_type, storage_path, is_primary, sort_order, created_at
      `,
      [productId, payload.mediaType, payload.storagePath, payload.isPrimary, payload.sortOrder, storeId],
    );

    const media = result.rows[0];
    if (!media) {
      throw new NotFoundException('Product not found');
    }

    if (payload.isPrimary) {
      await this.pool.query(
        `
          update catalog.product_media
          set is_primary = case when id = $2 then true else false end
          where product_id = $1
        `,
        [productId, media.id],
      );
    }

    return { media };
  }

  async createSku(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      productId: string;
      skuCode: string;
      barcode?: string;
      variantJson?: Record<string, unknown>;
      variantOptionIds?: string[];
      unitName?: string;
      weightValue?: number;
      weightUnit?: string;
      costPrice?: number | null;
      salePrice?: number;
      compareAtPrice?: number | null;
      effectiveFrom?: string;
      effectiveTo?: string | null;
      status: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const product = await this.requireProduct(client, payload.productId, storeId);
      const variantSelection = await this.resolveVariantSelection(
        client,
        product.id,
        storeId,
        payload.variantOptionIds ?? [],
        payload.variantJson,
      );

      const result = await client.query<{
        id: string;
        sku_code: string;
        barcode: string | null;
        variant_label: string | null;
        variant_json: Record<string, unknown> | null;
        status: string;
        created_at: string;
      }>(
        `
          insert into catalog.skus (
            id,
            tenant_id,
            store_id,
            product_id,
            sku_code,
            barcode,
            variant_json,
            variant_label,
            variant_key,
            unit_name,
            weight_value,
            weight_unit,
            status,
            created_at,
            updated_at
          )
          select
            gen_random_uuid(),
            s.tenant_id,
            s.id,
            $2,
            $3,
            $4,
            $5::jsonb,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            now(),
            now()
          from store.stores s
          where s.id = $1
          returning id, sku_code, barcode, variant_label, variant_json, status, created_at
        `,
        [
          storeId,
          payload.productId,
          payload.skuCode,
          payload.barcode ?? null,
          JSON.stringify(variantSelection.variantJson),
          variantSelection.variantLabel,
          variantSelection.variantKey,
          payload.unitName ?? null,
          payload.weightValue ?? null,
          payload.weightUnit ?? null,
          payload.status,
        ],
      );

      const sku = result.rows[0];
      await this.insertSkuVariantOptions(client, sku.id, variantSelection.options);

      let price = null;
      if (payload.salePrice !== undefined) {
        const priceResult = await client.query(
          `
            insert into catalog.prices (
              id,
              tenant_id,
              store_id,
              sku_id,
              cost_price,
              sale_price,
              compare_at_price,
              effective_from,
              effective_to,
              created_at,
              created_by
            )
            select
              gen_random_uuid(),
              s.tenant_id,
              s.id,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              now(),
              $8
            from store.stores s
            where s.id = $1
            returning id, sku_id, sale_price, effective_from, effective_to
          `,
          [
            storeId,
            sku.id,
            payload.costPrice ?? null,
            payload.salePrice,
            payload.compareAtPrice ?? null,
            payload.effectiveFrom ?? new Date().toISOString(),
            payload.effectiveTo ?? null,
            userId,
          ],
        );
        price = priceResult.rows[0] ?? null;
      }

      await client.query('commit');
      return { sku, price };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async updateSku(
    skuId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    payload: {
      barcode?: string | null;
      variantJson?: Record<string, unknown> | null;
      variantOptionIds?: string[] | null;
      unitName?: string | null;
      weightValue?: number | null;
      weightUnit?: string | null;
      status?: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const skuResult = await client.query<{ product_id: string }>(
        `
          select product_id
          from catalog.skus
          where id = $1
            and store_id = $2
          limit 1
          for update
        `,
        [skuId, storeId],
      );

      const skuRow = skuResult.rows[0];
      if (!skuRow) {
        throw new NotFoundException('SKU not found');
      }

      let variantSelection:
        | {
            variantJson: Record<string, unknown>;
            variantLabel: string | null;
            variantKey: string | null;
            options: VariantOptionRow[];
          }
        | null = null;

      if (payload.variantOptionIds !== undefined || payload.variantJson !== undefined) {
        variantSelection = await this.resolveVariantSelection(
          client,
          skuRow.product_id,
          storeId,
          payload.variantOptionIds ?? [],
          payload.variantJson ?? undefined,
        );
      }

      const result = await client.query(
        `
          update catalog.skus
          set
            barcode = case when $3::text is null then barcode else $3 end,
            variant_json = case when $4::jsonb is null then variant_json else $4::jsonb end,
            variant_label = case when $5::text is null then variant_label else $5 end,
            variant_key = case when $6::text is null then variant_key else $6 end,
            unit_name = case when $7::text is null then unit_name else $7 end,
            weight_value = case when $8::numeric is null then weight_value else $8 end,
            weight_unit = case when $9::text is null then weight_unit else $9 end,
            status = coalesce($10, status),
            updated_at = now()
          where id = $1
            and store_id = $2
          returning id, sku_code, barcode, variant_label, variant_json, status, updated_at
        `,
        [
          skuId,
          storeId,
          payload.barcode === undefined ? null : payload.barcode,
          variantSelection ? JSON.stringify(variantSelection.variantJson) : null,
          variantSelection?.variantLabel ?? null,
          variantSelection?.variantKey ?? null,
          payload.unitName === undefined ? null : payload.unitName,
          payload.weightValue === undefined ? null : payload.weightValue,
          payload.weightUnit === undefined ? null : payload.weightUnit,
          payload.status ?? null,
        ],
      );

      if (variantSelection) {
        await client.query(`delete from catalog.sku_variant_options where sku_id = $1`, [skuId]);
        await this.insertSkuVariantOptions(client, skuId, variantSelection.options);
      }

      await client.query('commit');
      return { sku: result.rows[0] };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async createPrice(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      skuId: string;
      costPrice?: number | null;
      salePrice: number;
      compareAtPrice?: number | null;
      effectiveFrom?: string;
      effectiveTo?: string | null;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);

    const skuExists = await this.pool.query(
      `
        select id
        from catalog.skus
        where id = $1
          and store_id = $2
        limit 1
      `,
      [payload.skuId, storeId],
    );

    if (!skuExists.rows[0]) {
      throw new NotFoundException('SKU not found for this store');
    }

    const result = await this.pool.query(
      `
        insert into catalog.prices (
          id,
          tenant_id,
          store_id,
          sku_id,
          cost_price,
          sale_price,
          compare_at_price,
          effective_from,
          effective_to,
          created_at,
          created_by
        )
        select
          gen_random_uuid(),
          s.tenant_id,
          s.id,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          now(),
          $8
        from store.stores s
        where s.id = $1
        returning id, sku_id, sale_price, effective_from, effective_to
      `,
      [
        storeId,
        payload.skuId,
        payload.costPrice ?? null,
        payload.salePrice,
        payload.compareAtPrice ?? null,
        payload.effectiveFrom ?? new Date().toISOString(),
        payload.effectiveTo ?? null,
        userId,
      ],
    );

    return {
      price: result.rows[0],
    };
  }

  async listPriceChangeRequests(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    filters: { status?: string; search?: string; page?: number; limit?: number } = {},
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const { page, limit, offset } = normalizePageQuery(filters);
    const search = filters.search?.trim() || null;
    const result = await this.pool.query(
      `
        select *
        from (
          select
            pcr.id,
            pcr.sku_id,
            sku.sku_code,
            p.name as product_name,
            sku.variant_label,
            pcr.current_cost_price,
            pcr.current_sale_price,
            pcr.current_compare_at_price,
            pcr.requested_cost_price,
            pcr.requested_sale_price,
            pcr.requested_compare_at_price,
            pcr.requested_effective_from,
            pcr.requested_effective_to,
            pcr.reason,
            pcr.status,
            pcr.requested_by,
            requester.full_name as requested_by_name,
            pcr.decided_by,
            decider.full_name as decided_by_name,
            pcr.decided_at,
            pcr.decision_note,
            pcr.created_at,
            count(*) over()::int as total_count
          from catalog.price_change_requests pcr
          join catalog.skus sku on sku.id = pcr.sku_id
          join catalog.products p on p.id = sku.product_id
          left join identity.user_profiles requester on requester.user_id = pcr.requested_by
          left join identity.user_profiles decider on decider.user_id = pcr.decided_by
          where pcr.store_id = $1
            and ($2::text is null or pcr.status = $2::text)
            and (
              $3::text is null
              or sku.sku_code ilike '%' || $3::text || '%'
              or p.name ilike '%' || $3::text || '%'
              or coalesce(sku.variant_label, '') ilike '%' || $3::text || '%'
              or pcr.reason ilike '%' || $3::text || '%'
            )
          order by pcr.created_at desc
          limit $4
          offset $5
        ) requests
      `,
      [storeId, filters.status ?? null, search, limit, offset],
    );

    const { items, total } = stripPaginationTotal(result.rows);
    return { priceChangeRequests: items, pagination: { page, limit, total } };
  }

  async requestPriceChange(
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: {
      skuId: string;
      costPrice?: number | null;
      salePrice: number;
      compareAtPrice?: number | null;
      effectiveFrom?: string;
      effectiveTo?: string | null;
      reason: string;
    },
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const latestPrice = await this.getLatestPriceForSku(storeId, payload.skuId);

    if (!latestPrice) {
      throw new NotFoundException('No current price exists for this SKU yet');
    }

    const result = await this.pool.query(
      `
        insert into catalog.price_change_requests (
          id,
          tenant_id,
          store_id,
          sku_id,
          current_price_id,
          requested_by,
          current_cost_price,
          current_sale_price,
          current_compare_at_price,
          requested_cost_price,
          requested_sale_price,
          requested_compare_at_price,
          requested_effective_from,
          requested_effective_to,
          reason,
          status,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          s.tenant_id,
          s.id,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          'pending',
          now(),
          now()
        from store.stores s
        where s.id = $1
        returning id, sku_id, requested_sale_price, status, created_at
      `,
      [
        storeId,
        payload.skuId,
        latestPrice.id,
        userId,
        latestPrice.cost_price === null ? null : Number(latestPrice.cost_price),
        Number(latestPrice.sale_price),
        latestPrice.compare_at_price === null ? null : Number(latestPrice.compare_at_price),
        payload.costPrice ?? null,
        payload.salePrice,
        payload.compareAtPrice ?? null,
        payload.effectiveFrom ?? new Date().toISOString(),
        payload.effectiveTo ?? null,
        payload.reason,
      ],
    );

    return { priceChangeRequest: result.rows[0] };
  }

  async approvePriceChange(
    requestId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { decisionNote?: string },
  ) {
    return this.decidePriceChange(
      requestId,
      headerStoreId,
      authContext,
      session,
      'approved',
      payload.decisionNote,
    );
  }

  async rejectPriceChange(
    requestId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    payload: { decisionNote?: string },
  ) {
    return this.decidePriceChange(
      requestId,
      headerStoreId,
      authContext,
      session,
      'rejected',
      payload.decisionNote,
    );
  }

  private async decidePriceChange(
    requestId: string,
    headerStoreId: string | undefined,
    authContext: StoreAuthContext | null,
    session: AuthSession | null,
    decision: 'approved' | 'rejected',
    decisionNote?: string,
  ) {
    const storeId = this.assertStoreContext(headerStoreId, authContext);
    const userId = this.requireUserId(session);
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const requestResult = await client.query<{
        id: string;
        sku_id: string;
        status: string;
        requested_cost_price: string | null;
        requested_sale_price: string;
        requested_compare_at_price: string | null;
        requested_effective_from: string;
        requested_effective_to: string | null;
      }>(
        `
          select
            id,
            sku_id,
            status,
            requested_cost_price,
            requested_sale_price,
            requested_compare_at_price,
            requested_effective_from,
            requested_effective_to
          from catalog.price_change_requests
          where id = $1
            and store_id = $2
          limit 1
          for update
        `,
        [requestId, storeId],
      );

      const request = requestResult.rows[0];
      if (!request) {
        throw new NotFoundException('Price change request not found');
      }

      if (request.status !== 'pending') {
        throw new ForbiddenException('Only pending price requests can be decided');
      }

      let approvedPriceId: string | null = null;
      if (decision === 'approved') {
        const priceResult = await client.query<{ id: string }>(
          `
            insert into catalog.prices (
              id,
              tenant_id,
              store_id,
              sku_id,
              cost_price,
              sale_price,
              compare_at_price,
              effective_from,
              effective_to,
              created_at,
              created_by
            )
            select
              gen_random_uuid(),
              s.tenant_id,
              s.id,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              now(),
              $8
            from store.stores s
            where s.id = $1
            returning id
          `,
          [
            storeId,
            request.sku_id,
            request.requested_cost_price === null ? null : Number(request.requested_cost_price),
            Number(request.requested_sale_price),
            request.requested_compare_at_price === null ? null : Number(request.requested_compare_at_price),
            request.requested_effective_from,
            request.requested_effective_to,
            userId,
          ],
        );
        approvedPriceId = priceResult.rows[0]?.id ?? null;
      }

      await client.query(
        `
          update catalog.price_change_requests
          set status = $2,
              decided_by = $3,
              decided_at = now(),
              decision_note = $4,
              approved_price_id = $5,
              updated_at = now()
          where id = $1
        `,
        [requestId, decision, userId, decisionNote ?? null, approvedPriceId],
      );

      await client.query('commit');
      return { ok: true, decision, approvedPriceId };
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async getLatestPriceForSku(storeId: string, skuId: string) {
    const result = await this.pool.query<LatestPriceRow>(
      `
        select id, cost_price, sale_price, compare_at_price, effective_from, effective_to
        from catalog.prices
        where store_id = $1
          and sku_id = $2
          and (effective_to is null or effective_to > now())
        order by effective_from desc, created_at desc
        limit 1
      `,
      [storeId, skuId],
    );

    return result.rows[0] ?? null;
  }

  private async resolveVariantSelection(
    client: PoolClient,
    productId: string,
    storeId: string,
    variantOptionIds: string[],
    fallbackVariantJson?: Record<string, unknown> | null,
  ) {
    if (!variantOptionIds.length) {
      return {
        variantJson: fallbackVariantJson ?? {},
        variantLabel: null,
        variantKey: null,
        options: [],
      };
    }

    const optionResult = await client.query<VariantOptionRow>(
      `
        select
          vg.id as variant_group_id,
          vg.name as variant_group_name,
          vg.code as variant_group_code,
          vg.sort_order as group_sort_order,
          vo.id as option_id,
          vo.label as option_label,
          vo.code as option_code,
          vo.sort_order as option_sort_order,
          vo.status
        from catalog.product_variant_options vo
        join catalog.product_variant_groups vg on vg.id = vo.variant_group_id
        where vo.id = any($1::uuid[])
          and vo.product_id = $2
          and vo.store_id = $3
          and vo.status = 'active'
          and vg.status = 'active'
        order by vg.sort_order asc, vo.sort_order asc, vo.created_at asc
      `,
      [variantOptionIds, productId, storeId],
    );

    const options = optionResult.rows;
    if (options.length !== variantOptionIds.length) {
      throw new ForbiddenException('One or more variant options are invalid for this product');
    }

    const uniqueGroupCount = new Set(options.map((option) => option.variant_group_id)).size;
    if (uniqueGroupCount !== options.length) {
      throw new ForbiddenException('Only one option per variant group is allowed for each SKU');
    }

    const orderedOptions = [...options].sort((left, right) => {
      if (left.group_sort_order !== right.group_sort_order) {
        return left.group_sort_order - right.group_sort_order;
      }

      if (left.option_sort_order !== right.option_sort_order) {
        return left.option_sort_order - right.option_sort_order;
      }

      return left.option_label.localeCompare(right.option_label);
    });

    const variantJson = Object.fromEntries(
      orderedOptions.map((option) => [option.variant_group_code, option.option_label]),
    );
    const variantLabel = orderedOptions.map((option) => option.option_label).join(' / ');
    const variantKey = orderedOptions
      .map((option) => `${option.variant_group_id}:${option.option_id}`)
      .join('|');

    return {
      variantJson,
      variantLabel,
      variantKey,
      options: orderedOptions,
    };
  }

  private async insertSkuVariantOptions(client: PoolClient, skuId: string, options: VariantOptionRow[]) {
    for (const option of options) {
      await client.query(
        `
          insert into catalog.sku_variant_options (
            sku_id,
            variant_group_id,
            variant_option_id,
            sort_order,
            created_at
          )
          values ($1, $2, $3, $4, now())
        `,
        [skuId, option.variant_group_id, option.option_id, option.group_sort_order],
      );
    }
  }

  private async requireProduct(client: PoolClient, productId: string, storeId: string) {
    const productResult = await client.query<{
      id: string;
      has_variants: boolean;
      variant_mode: 'none' | 'single' | 'multi';
    }>(
      `
        select id, has_variants, variant_mode
        from catalog.products
        where id = $1
          and store_id = $2
        limit 1
      `,
      [productId, storeId],
    );

    const product = productResult.rows[0];
    if (!product) {
      throw new NotFoundException('Product not found for this store');
    }

    return product;
  }

  private async touchProductVariantMode(productId: string, storeId: string) {
    const countsResult = await this.pool.query<{ group_count: string }>(
      `
        select count(*)::text as group_count
        from catalog.product_variant_groups
        where product_id = $1
          and store_id = $2
          and status = 'active'
      `,
      [productId, storeId],
    );

    const groupCount = Number(countsResult.rows[0]?.group_count ?? 0);
    const variantMode: 'none' | 'single' | 'multi' =
      groupCount <= 0 ? 'none' : groupCount === 1 ? 'single' : 'multi';

    await this.pool.query(
      `
        update catalog.products
        set has_variants = $3,
            variant_mode = $4,
            updated_at = now()
        where id = $1
          and store_id = $2
      `,
      [productId, storeId, groupCount > 0, variantMode],
    );
  }

  private assertVariantModeConsistency(hasVariants: boolean, variantMode: 'none' | 'single' | 'multi') {
    if (!hasVariants && variantMode !== 'none') {
      throw new ForbiddenException('Products without variants must use variant mode none');
    }

    if (hasVariants && variantMode === 'none') {
      throw new ForbiddenException('Variant products must use single or multi mode');
    }
  }

  private assertStoreContext(headerStoreId: string | undefined, authContext: StoreAuthContext | null) {
    if (!authContext || authContext.type !== 'store') {
      throw new ForbiddenException('Store context is required');
    }

    if (headerStoreId && headerStoreId !== authContext.storeId) {
      throw new ForbiddenException('Store header does not match authenticated context');
    }

    return authContext.storeId;
  }

  private requireUserId(session: AuthSession | null) {
    if (!session) {
      throw new UnauthorizedException('Missing auth session');
    }
    return session.user.id;
  }
}
