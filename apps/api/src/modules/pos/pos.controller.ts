import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
  productType: z.string().optional(),
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
  vatAmount: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  shippingAmount: z.number().nonnegative().default(0),
  note: z.string().optional(),
  exchangeSkuId: z.string().uuid().optional(),
  exchangeAmount: z.number().nonnegative().default(0),
  items: z.array(
    z.object({
      skuId: z.string().uuid(),
      qty: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      discountAmount: z.number().nonnegative().default(0),
      taxAmount: z.number().nonnegative().default(0),
      serialIds: z.array(z.string().uuid()).optional(),
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
  refundMethod: z.enum(['cash', 'card', 'mfs', 'bank_transfer']).optional(),
  refundReference: z.string().max(100).optional(),
  items: z.array(
    z.object({
      saleItemId: z.string().uuid(),
      qty: z.number().positive(),
      restockToInventory: z.boolean().default(true),
      lineRefundAmount: z.number().nonnegative(),
    }),
  ).min(1),
});

const createExchangeSchema = z.object({
  originalSaleId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  registerId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  note: z.string().max(1000).optional(),
  returnedItems: z.array(
    z.object({
      saleItemId: z.string().uuid(),
      qty: z.number().positive(),
      restock: z.boolean().default(true),
      serialIds: z.array(z.string().uuid()).optional(),
    }),
  ).min(1),
  newItems: z.array(
    z.object({
      skuId: z.string().uuid(),
      qty: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      discountAmount: z.number().nonnegative().default(0),
      taxAmount: z.number().nonnegative().default(0),
      serialIds: z.array(z.string().uuid()).optional(),
    }),
  ).min(1),
  payments: z.array(
    z.object({
      paymentMethod: z.enum(['cash', 'card', 'mfs', 'bank_transfer', 'split']),
      gatewayProvider: z.string().optional(),
      amount: z.number().nonnegative(),
      referenceNo: z.string().optional(),
    }),
  ).default([]),
  refundMethod: z.enum(['cash', 'card', 'mfs', 'bank_transfer']).optional(),
  refundReference: z.string().max(100).optional(),
});

const updateReturnRefundSchema = z.object({
  refundMethod: z.enum(['cash', 'card', 'mfs', 'bank_transfer']).optional(),
  refundReference: z.string().max(100).optional(),
});

const createExchangeItemSchema = z.object({
  productName: z.string().min(1).max(200),
  categoryName: z.string().max(100).optional(),
  brandName: z.string().max(100).optional(),
  costPrice: z.number().nonnegative().default(0),
  salePrice: z.number().nonnegative(),
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
    @Query('productType') productType: string | undefined,
  ) {
    const payload = searchCatalogSchema.parse({
      barcode,
      q: query,
      locationId,
      limit,
      productType,
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

  @Post('exchange-item')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  createExchangeItem(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.posService.createExchangeItem(headerStoreId, authContext, createExchangeItemSchema.parse(payload));
  }

  @Get('sales')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listSales(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.posService.listSales(headerStoreId, authContext, {
      query,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy,
      sortDir,
    });
  }

  @Get('sales-report')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getSalesReport(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('month') month?: string,
  ) {
    return this.posService.getSalesReport(headerStoreId, authContext, {
      fromDate,
      toDate,
      month,
    });
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


  @Get('returns-report')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getReturnsReport(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('month') month?: string,
  ) {
    return this.posService.getReturnsReport(headerStoreId, authContext, {
      fromDate,
      toDate,
      month,
    });
  }

  @Get('sales/:saleId/returns')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getSaleReturns(
    @Param('saleId') saleId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.posService.getSaleReturns(saleId, headerStoreId, authContext);
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

  // ── Return approval workflow (owner/manager approval for high-value returns) ──

  @Get('returns/pending-approvals')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getPendingReturnApprovals(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.posService.getPendingReturnApprovals(headerStoreId, authContext);
  }

  @Post('returns/:returnId/approve')
  @RequireContext('store')
  @RequirePermissions('inventory.adjust.approve')
  approveReturn(
    @Param('returnId') returnId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: { decisionNote?: string },
  ) {
    return this.posService.approveReturn(returnId, headerStoreId, authContext, session, payload?.decisionNote);
  }

  @Post('returns/:returnId/reject')
  @RequireContext('store')
  @RequirePermissions('inventory.adjust.approve')
  rejectReturn(
    @Param('returnId') returnId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: { decisionNote?: string },
  ) {
    return this.posService.rejectReturn(returnId, headerStoreId, authContext, session, payload?.decisionNote);
  }

  @Patch('sales/:saleId/returns/:returnId')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  updateReturnRefundDetails(
    @Param('saleId') saleId: string,
    @Param('returnId') returnId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.posService.updateReturnRefundDetails(
      saleId,
      returnId,
      headerStoreId,
      authContext,
      updateReturnRefundSchema.parse(payload),
    );
  }

  // ── Exchange documents ──

  @Get('exchanges/lookup')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  lookupExchangesForExchange(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('phone') phone?: string,
    @Query('saleNo') saleNo?: string,
    @Query('invoice') invoice?: string,
  ) {
    return this.posService.lookupExchangesForExchange(headerStoreId, authContext, {
      phone,
      saleNo,
      invoice,
    });
  }

  @Post('exchanges')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  createExchange(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.posService.createExchange(headerStoreId, authContext, session, createExchangeSchema.parse(payload));
  }

  @Get('exchanges')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listExchanges(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.posService.listExchanges(headerStoreId, authContext, {
      query,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('exchanges/:exchangeId')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getExchange(
    @Param('exchangeId') exchangeId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.posService.getExchange(exchangeId, headerStoreId, authContext);
  }

  @Post('exchanges/:exchangeId/reprint')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  reprintExchangeReceipt(
    @Param('exchangeId') exchangeId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.posService.reprintExchangeReceipt(exchangeId, headerStoreId, authContext);
  }
}
