import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { BillingService } from './billing.service.js';

const changeSubscriptionSchema = z.object({
  planCode: z.enum(['basic', 'standard', 'pro']),
  autoRenew: z.boolean().default(true),
});

const invoicePaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'mfs', 'bank_transfer', 'gateway']),
  gatewayProvider: z.string().max(100).optional(),
  amount: z.number().positive(),
  referenceNo: z.string().max(100).optional(),
  status: z.enum(['pending', 'paid', 'failed', 'refunded']).default('paid'),
  paidAt: z.string().datetime().optional(),
});

@Controller('billing')
@UseGuards(PermissionsGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @RequireContext('store')
  @RequirePermissions('billing.subscription.manage')
  getPlans(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.billingService.getPlans(headerStoreId, authContext);
  }

  @Get('subscription')
  @RequireContext('store')
  @RequirePermissions('billing.subscription.manage')
  getCurrentSubscription(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.billingService.getCurrentSubscription(headerStoreId, authContext);
  }

  @Get('subscription/summary')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  getSubscriptionSummary(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.billingService.getCurrentSubscription(headerStoreId, authContext);
  }

  @Post('subscription/change')
  @RequireContext('store')
  @RequirePermissions('billing.subscription.manage')
  changeSubscription(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.billingService.changeSubscription(
      headerStoreId,
      authContext,
      session,
      changeSubscriptionSchema.parse(payload),
    );
  }

  @Get('invoices')
  @RequireContext('store')
  @RequirePermissions('billing.subscription.manage')
  getInvoices(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.billingService.getInvoices(headerStoreId, authContext, {
      status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('invoices/:invoiceId')
  @RequireContext('store')
  @RequirePermissions('billing.subscription.manage')
  getInvoice(
    @Param('invoiceId') invoiceId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.billingService.getInvoice(invoiceId, headerStoreId, authContext);
  }

  @Post('invoices/:invoiceId/payments')
  @RequireContext('store')
  @RequirePermissions('billing.subscription.manage')
  addInvoicePayment(
    @Param('invoiceId') invoiceId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.billingService.addInvoicePayment(
      invoiceId,
      headerStoreId,
      authContext,
      session,
      invoicePaymentSchema.parse(payload),
    );
  }
}

@Controller('admin/billing')
@UseGuards(PermissionsGuard)
export class AdminBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  getPlans(@CurrentAuthSession() session: AuthSession | null) {
    if (!session) {
      throw new Error('Missing admin session');
    }
    return this.billingService.getAdminPlans(session.user.tenantId);
  }
}
