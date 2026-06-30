import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { CatalogService } from './catalog.service.js';

const createProductSchema = z.object({
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  productCode: z.string().min(1).max(50),
  name: z.string().min(1).max(250),
  nameBn: z.string().max(250).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive', 'archived', 'out_of_stock']).default('active'),
  isTrackable: z.boolean().default(true),
  hasVariants: z.boolean().default(false),
  variantMode: z.enum(['none', 'single', 'multi']).default('none'),
});

const updateProductSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(250).optional(),
  nameBn: z.string().max(250).nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive', 'archived', 'out_of_stock']).optional(),
  isTrackable: z.boolean().optional(),
  hasVariants: z.boolean().optional(),
  variantMode: z.enum(['none', 'single', 'multi']).optional(),
});

const createVariantGroupSchema = z.object({
  code: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  inputType: z.enum(['text', 'color', 'number']).default('text'),
  sortOrder: z.number().int().nonnegative().default(0),
  isRequired: z.boolean().default(true),
  status: z.enum(['active', 'inactive']).default('active'),
});

const updateVariantGroupSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  inputType: z.enum(['text', 'color', 'number']).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  isRequired: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const createVariantOptionSchema = z.object({
  variantGroupId: z.string().uuid(),
  code: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  valueText: z.string().max(120).optional(),
  valueNumber: z.number().optional(),
  colorHex: z.string().max(20).optional(),
  sortOrder: z.number().int().nonnegative().default(0),
  status: z.enum(['active', 'inactive']).default('active'),
});

const updateVariantOptionSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  valueText: z.string().max(120).nullable().optional(),
  valueNumber: z.number().nullable().optional(),
  colorHex: z.string().max(20).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const createSkuSchema = z.object({
  productId: z.string().uuid(),
  skuCode: z.string().min(1).max(80),
  barcode: z.string().max(80).optional(),
  variantLabel: z.string().max(160).optional(),
  variantJson: z.record(z.any()).optional(),
  variantOptionIds: z.array(z.string().uuid()).optional(),
  unitName: z.string().max(50).optional(),
  weightValue: z.number().nonnegative().optional(),
  weightUnit: z.string().max(20).optional(),
  costPrice: z.number().nonnegative().nullable().optional(),
  salePrice: z.number().nonnegative().optional(),
  compareAtPrice: z.number().nonnegative().nullable().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
});

const updateSkuSchema = z.object({
  barcode: z.string().max(80).nullable().optional(),
  variantJson: z.record(z.any()).nullable().optional(),
  variantOptionIds: z.array(z.string().uuid()).nullable().optional(),
  unitName: z.string().max(50).nullable().optional(),
  weightValue: z.number().nonnegative().nullable().optional(),
  weightUnit: z.string().max(20).nullable().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

const createPriceSchema = z.object({
  skuId: z.string().uuid(),
  costPrice: z.number().nonnegative().nullable().optional(),
  salePrice: z.number().nonnegative(),
  compareAtPrice: z.number().nonnegative().nullable().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
});

const createPriceChangeRequestSchema = z.object({
  skuId: z.string().uuid(),
  costPrice: z.number().nonnegative().nullable().optional(),
  salePrice: z.number().nonnegative(),
  compareAtPrice: z.number().nonnegative().nullable().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
  reason: z.string().min(3),
});

const decisionSchema = z.object({
  decisionNote: z.string().optional(),
});

const createCategorySchema = z.object({
  parentId: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  nameBn: z.string().max(150).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  sortOrder: z.number().int().nonnegative().default(0),
});

const createBrandSchema = z.object({
  name: z.string().min(1).max(150),
  nameBn: z.string().max(150).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const updateCategorySchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(150).optional(),
  nameBn: z.string().max(150).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

const updateBrandSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  nameBn: z.string().max(150).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const createProductMediaSchema = z.object({
  mediaType: z.enum(['image', 'document']),
  storagePath: z.string().min(1),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
});

@Controller('catalog')
@UseGuards(PermissionsGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('categories')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  listCategories(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.catalogService.listCategories(headerStoreId, authContext, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('categories')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  createCategory(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.createCategory(headerStoreId, authContext, createCategorySchema.parse(payload));
  }

  @Patch('categories/:categoryId')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  updateCategory(
    @Param('categoryId') categoryId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.updateCategory(
      categoryId,
      headerStoreId,
      authContext,
      updateCategorySchema.parse(payload),
    );
  }

  @Delete('categories/:categoryId')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  deleteCategory(
    @Param('categoryId') categoryId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.catalogService.deleteCategory(categoryId, headerStoreId, authContext);
  }

  @Get('brands')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  listBrands(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.catalogService.listBrands(headerStoreId, authContext, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('brands')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  createBrand(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.createBrand(headerStoreId, authContext, createBrandSchema.parse(payload));
  }

  @Patch('brands/:brandId')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  updateBrand(
    @Param('brandId') brandId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.updateBrand(
      brandId,
      headerStoreId,
      authContext,
      updateBrandSchema.parse(payload),
    );
  }

  @Delete('brands/:brandId')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  deleteBrand(
    @Param('brandId') brandId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.catalogService.deleteBrand(brandId, headerStoreId, authContext);
  }

  @Get('skus/search')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  searchSkus(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('q') query?: string,
    @Query('barcode') barcode?: string,
    @Query('limit') limit?: string,
  ) {
    return this.catalogService.searchSkus(headerStoreId, authContext, {
      query,
      barcode,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('products')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  listProducts(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.catalogService.listProducts(headerStoreId, authContext, {
      status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('products/:productId')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  getProduct(
    @Param('productId') productId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.catalogService.getProduct(productId, headerStoreId, authContext);
  }

  @Post('products')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  createProduct(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.createProduct(
      headerStoreId,
      authContext,
      session,
      createProductSchema.parse(payload),
    );
  }

  @Patch('products/:productId')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  updateProduct(
    @Param('productId') productId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.updateProduct(
      productId,
      headerStoreId,
      authContext,
      session,
      updateProductSchema.parse(payload),
    );
  }

  @Delete('products/:productId')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  deleteProduct(
    @Param('productId') productId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.catalogService.deleteProduct(productId, headerStoreId, authContext);
  }

  @Get('products/:productId/variants')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  getProductVariants(
    @Param('productId') productId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.catalogService.getProductVariants(productId, headerStoreId, authContext);
  }

  @Post('products/:productId/variant-groups')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  createVariantGroup(
    @Param('productId') productId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.createVariantGroup(
      productId,
      headerStoreId,
      authContext,
      createVariantGroupSchema.parse(payload),
    );
  }

  @Patch('variant-groups/:variantGroupId')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  updateVariantGroup(
    @Param('variantGroupId') variantGroupId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.updateVariantGroup(
      variantGroupId,
      headerStoreId,
      authContext,
      updateVariantGroupSchema.parse(payload),
    );
  }

  @Post('products/:productId/variant-options')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  createVariantOption(
    @Param('productId') productId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.createVariantOption(
      productId,
      headerStoreId,
      authContext,
      createVariantOptionSchema.parse(payload),
    );
  }

  @Patch('variant-options/:variantOptionId')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  updateVariantOption(
    @Param('variantOptionId') variantOptionId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.updateVariantOption(
      variantOptionId,
      headerStoreId,
      authContext,
      updateVariantOptionSchema.parse(payload),
    );
  }

  @Post('products/:productId/media')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  addProductMedia(
    @Param('productId') productId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.addProductMedia(
      productId,
      headerStoreId,
      authContext,
      createProductMediaSchema.parse(payload),
    );
  }

  @Post('skus')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  createSku(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.createSku(headerStoreId, authContext, session, createSkuSchema.parse(payload));
  }

  @Patch('skus/:skuId')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  updateSku(
    @Param('skuId') skuId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.updateSku(skuId, headerStoreId, authContext, updateSkuSchema.parse(payload));
  }

  @Post('prices')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  createPrice(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.createPrice(
      headerStoreId,
      authContext,
      session,
      createPriceSchema.parse(payload),
    );
  }

  @Get('price-change-requests')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  listPriceChangeRequests(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.catalogService.listPriceChangeRequests(headerStoreId, authContext, {
      status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('price-change-requests')
  @RequireContext('store')
  @RequirePermissions('catalog.manage')
  requestPriceChange(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.requestPriceChange(
      headerStoreId,
      authContext,
      session,
      createPriceChangeRequestSchema.parse(payload),
    );
  }

  @Post('price-change-requests/:requestId/approve')
  @RequireContext('store')
  @RequirePermissions('inventory.adjust.approve')
  approvePriceChange(
    @Param('requestId') requestId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.approvePriceChange(
      requestId,
      headerStoreId,
      authContext,
      session,
      decisionSchema.parse(payload),
    );
  }

  @Post('price-change-requests/:requestId/reject')
  @RequireContext('store')
  @RequirePermissions('inventory.adjust.approve')
  rejectPriceChange(
    @Param('requestId') requestId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.catalogService.rejectPriceChange(
      requestId,
      headerStoreId,
      authContext,
      session,
      decisionSchema.parse(payload),
    );
  }
}
