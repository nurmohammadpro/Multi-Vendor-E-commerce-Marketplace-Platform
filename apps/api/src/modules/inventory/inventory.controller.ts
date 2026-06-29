import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { InventoryService } from './inventory.service.js';

const createLocationSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  locationType: z.enum(['storefront', 'warehouse', 'backroom']),
});

const initializeStockSchema = z.object({
  locationId: z.string().uuid(),
  skuId: z.string().uuid(),
  quantity: z.number().positive(),
  note: z.string().optional(),
});

const requestAdjustmentSchema = z.object({
  locationId: z.string().uuid(),
  skuId: z.string().uuid(),
  requestedQty: z.number().nonnegative(),
  reason: z.string().min(3),
});

const decisionSchema = z.object({
  decisionNote: z.string().optional(),
});

@Controller('inventory')
@UseGuards(PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('locations')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  listLocations(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.inventoryService.listLocations(headerStoreId, authContext);
  }

  @Post('locations')
  @RequireContext('store')
  @RequirePermissions('inventory.adjust.direct')
  createLocation(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.inventoryService.createLocation(headerStoreId, authContext, createLocationSchema.parse(payload));
  }

  @Get('balances')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  listBalances(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('locationId') locationId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.listBalances(headerStoreId, authContext, {
      locationId,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('initialize')
  @RequireContext('store')
  @RequirePermissions('inventory.adjust.request')
  initializeStock(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.inventoryService.initializeStock(
      headerStoreId,
      authContext,
      session,
      initializeStockSchema.parse(payload),
    );
  }

  @Post('adjustments/request')
  @RequireContext('store')
  @RequirePermissions('inventory.adjust.request')
  requestAdjustment(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.inventoryService.requestAdjustment(
      headerStoreId,
      authContext,
      session,
      requestAdjustmentSchema.parse(payload),
    );
  }

  @Get('adjustments')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  listAdjustments(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.listAdjustments(headerStoreId, authContext, {
      status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('adjustments/:requestId/approve')
  @RequireContext('store')
  @RequirePermissions('inventory.adjust.approve')
  approveAdjustment(
    @Param('requestId') requestId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.inventoryService.approveAdjustment(
      requestId,
      headerStoreId,
      authContext,
      session,
      decisionSchema.parse(payload),
    );
  }

  @Post('adjustments/:requestId/reject')
  @RequireContext('store')
  @RequirePermissions('inventory.adjust.approve')
  rejectAdjustment(
    @Param('requestId') requestId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.inventoryService.rejectAdjustment(
      requestId,
      headerStoreId,
      authContext,
      session,
      decisionSchema.parse(payload),
    );
  }

  @Get('ledger')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  getLedger(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('skuId') skuId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.getLedger(headerStoreId, authContext, {
      skuId,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
