import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext } from '../auth/current-auth.decorator.js';
import type { StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { PaymentsService } from './payments.service.js';

const createGatewaySchema = z.object({
  providerCode: z.string().min(1).max(50),
  displayName: z.string().min(1).max(100),
  credentialsRef: z.string().min(1),
  status: z.enum(['active', 'inactive']).default('active'),
});

const updateGatewaySchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  credentialsRef: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const processPaymentSchema = z.object({
  gatewayId: z.string().uuid(),
  amount: z.number().positive(),
  orderReference: z.string().min(1).max(100),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(30).optional(),
  customerEmail: z.string().email().optional(),
});

const refundSchema = z.object({
  gatewayId: z.string().uuid().optional(),
  transactionRef: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().max(300).optional(),
});

@Controller('payments')
@UseGuards(PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ── Gateways ──

  @Get('gateways')
  @RequireContext('store')
  @RequirePermissions('payment.gateway.manage')
  listGateways(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.paymentsService.listGateways(headerStoreId, authContext);
  }

  @Post('gateways')
  @RequireContext('store')
  @RequirePermissions('payment.gateway.manage')
  createGateway(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.paymentsService.createGateway(headerStoreId, authContext, createGatewaySchema.parse(payload));
  }

  @Patch('gateways/:gatewayId')
  @RequireContext('store')
  @RequirePermissions('payment.gateway.manage')
  updateGateway(
    @Param('gatewayId') gatewayId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.paymentsService.updateGateway(gatewayId, headerStoreId, authContext, updateGatewaySchema.parse(payload));
  }

  // ── Providers ──

  @Get('providers')
  @RequireContext('store')
  @RequirePermissions('payment.gateway.manage')
  listProviders() {
    return this.paymentsService.listProviders();
  }

  // ── Payment Processing ──

  @Post('process')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  processPayment(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    const input = processPaymentSchema.parse(payload);
    const storeId = headerStoreId || authContext?.storeId;
    if (!storeId) throw new Error('Store context required');
    return this.paymentsService.processPayment(input.gatewayId, storeId, input);
  }

  @Get('transactions/:transactionRef')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  queryPaymentStatus(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Param('transactionRef') transactionRef: string,
    @Query('gatewayId') gatewayId?: string,
  ) {
    const gwId = gatewayId || '';
    return this.paymentsService.queryPaymentStatus(gwId, transactionRef);
  }

  @Post('refund')
  @RequireContext('store')
  @RequirePermissions('payment.gateway.manage')
  processRefund(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    const input = refundSchema.parse(payload);
    return this.paymentsService.processRefund(input.gatewayId || '', input.transactionRef, input.amount, input.reason);
  }

  @Get('transactions')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listTransactions(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const storeId = headerStoreId || authContext?.storeId;
    if (!storeId) throw new Error('Store context required');
    return this.paymentsService.listTransactions(storeId, {
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }
}
