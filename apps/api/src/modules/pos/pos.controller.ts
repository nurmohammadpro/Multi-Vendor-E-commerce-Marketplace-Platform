import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { PosService } from './pos.service.js';

const searchCatalogSchema = z.object({
  barcode: z.string().max(80).optional(),
  q: z.string().max(120).optional(),
  locationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
}).refine((value) => Boolean(value.barcode || value.q), {
  message: 'barcode or q is required',
});

const openShiftSchema = z.object({
  registerId: z.string().uuid(),
  openingCash: z.number().nonnegative().default(0),
});

const closeShiftSchema = z.object({
  closingCash: z.number().nonnegative(),
});

const createSaleSchema = z.object({
  clientRequestId: z.string().uuid().optional(),
  locationId: z.string().uuid(),
  registerId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(30).optional(),
  customerEmail: z.string().email().optional(),
  customerShopName: z.string().max(200).optional(),
  customerAddress: z.string().max(500).optional(),
  dueDate: z.string().date().optional(),
  discountAmount: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  shippingAmount: z.number().nonnegative().default(0),
  note: z.string().optional(),
  items: z.array(
    z.object({
      skuId: z.string().uuid(),
      qty: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      discountAmount: z.number().nonnegative().default(0),
      taxAmount: z.number().nonnegative().default(0),
    }),
  ).min(1),
  payments: z.array(
    z.object({
      paymentMethod: z.enum(['cash', 'card', 'mfs', 'bank_transfer', 'split']),
      gatewayProvider: z.string().optional(),
      amount: z.number().nonnegative(),
      referenceNo: z.string().optional(),
      status: z.enum(['pending', 'paid', 'failed', 'refunded']).default('paid'),
    }),
  ).min(1),
});

const returnSaleSchema = z.object({
  reason: z.string().min(3),
  refundAmount: z.number().nonnegative(),
  items: z.array(
    z.object({
      saleItemId: z.string().uuid(),
      qty: z.number().positive(),
      restockToInventory: z.boolean().default(true),
      lineRefundAmount: z.number().nonnegative(),
    }),
  ).min(1),
});

@Controller('pos')
@UseGuards(PermissionsGuard)
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('registers')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  getRegisters(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.posService.getRegisters(headerStoreId, authContext);
  }

  @Get('catalog/search')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  searchCatalog(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('barcode') barcode: string | undefined,
    @Query('q') query: string | undefined,
    @Query('locationId') locationId: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    const payload = searchCatalogSchema.parse({
      barcode,
      q: query,
      locationId,
      limit,
    });

    return this.posService.searchCatalog(headerStoreId, authContext, payload);
  }

  @Post('shifts/open')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  openShift(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.posService.openShift(headerStoreId, authContext, session, openShiftSchema.parse(payload));
  }

  @Post('shifts/:shiftId/close')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  closeShift(
    @Param('shiftId') shiftId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.posService.closeShift(
      shiftId,
      headerStoreId,
      authContext,
      session,
      closeShiftSchema.parse(payload),
    );
  }

  @Post('sales')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  createSale(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    const parsed = createSaleSchema.parse(payload);
    return this.posService.createSale(
      headerStoreId,
      authContext,
      session,
      {
        ...parsed,
        clientRequestId: parsed.clientRequestId ?? idempotencyKey,
      },
    );
  }

  @Get('sales/:saleId')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getSale(
    @Param('saleId') saleId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.posService.getSale(saleId, headerStoreId, authContext);
  }

  @Post('sales/:saleId/reprint')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  reprintSaleReceipt(
    @Param('saleId') saleId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.posService.reprintSaleReceipt(saleId, headerStoreId, authContext);
  }

  // ── Print-job polling for local print agent ──

  @Get('print-jobs/pending')
  @RequireContext('store') @RequirePermissions('sales.pos.create')
  listPending(@Headers('x-store-id') h: string | undefined, @CurrentAuthContext() a: StoreAuthContext | null, @Query('limit') limit?: string) {
    const storeId = h || a?.storeId;
    return this.posService.listPendingPrintJobs(storeId || '', Number(limit) || 5);
  }

  @Get('print-jobs/:jobId/receipt')
  @RequireContext('store') @RequirePermissions('sales.pos.create')
  getJobReceipt(@Param('jobId') id: string, @Headers('x-store-id') h: string | undefined, @CurrentAuthContext() a: StoreAuthContext | null) {
    const storeId = h || a?.storeId;
    return this.posService.getPrintJobReceipt(id, storeId || '');
  }

  @Post('print-jobs/:jobId/complete')
  @RequireContext('store') @RequirePermissions('sales.pos.create')
  completeJob(@Param('jobId') id: string, @Headers('x-store-id') h: string | undefined, @CurrentAuthContext() a: StoreAuthContext | null, @Body() p: any) {
    const storeId = h || a?.storeId;
    return this.posService.markPrintJobComplete(id, storeId || '', p?.status || 'printed', p?.errorMessage);
  }


  @Post('sales/:saleId/returns')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  returnSale(
    @Param('saleId') saleId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.posService.returnSale(
      saleId,
      headerStoreId,
      authContext,
      session,
      returnSaleSchema.parse(payload),
    );
  }
}
