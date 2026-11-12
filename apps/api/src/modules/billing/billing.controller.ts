import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { BillingService } from './billing.service.js';
import { DEFAULT_TRIAL_DAYS } from './billing-cycle.js';

const changeSubscriptionSchema = z.object({
  planCode: z.string().min(1).max(50),
  autoRenew: z.boolean().default(true),
});

const createPlanSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  priceAmount: z.number().min(0),
  signupFee: z.number().min(0).default(0),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  maxUsers: z.number().int().min(1).default(1),
  maxLocations: z.number().int().min(1).default(1),
  trialDays: z.number().int().min(0).max(365).default(DEFAULT_TRIAL_DAYS),
  features: z.array(z.string()).default([]),
});

const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  priceAmount: z.number().min(0).optional(),
  signupFee: z.number().min(0).optional(),
  billingCycle: z.enum(['monthly', 'yearly']).optional(),
  maxUsers: z.number().int().min(1).optional(),
  maxLocations: z.number().int().min(1).optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  features: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const invoicePaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'mfs', 'bank_transfer', 'gateway']),
  gatewayProvider: z.string().max(100).optional(),
  amount: z.number().positive(),
  referenceNo: z.string().max(100).optional(),
  status: z.enum(['pending', 'paid', 'failed', 'refunded']).default('paid'),
  paidAt: z.string().datetime().optional(),
});

const renewalRequestSchema = z.object({
  paymentMethod: z.enum(['banglaqr', 'bkash', 'bank_transfer', 'cash', 'other']).default('banglaqr'),
  // Mandatory: the tenant scans the Bank Asia BanglaQR merchant code, so we
  // need the number the money was sent from to match it against our statement.
  senderNumber: z.string().trim().min(4).max(32),
  transactionId: z.string().trim().max(100).optional(),
  note: z.string().trim().max(1000).optional(),
});

const renewalDecisionSchema = z.object({
  note: z.string().trim().max(1000).optional(),
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

  @Get('plan-limits')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  getPlanLimits(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.billingService.getPlanLimits(headerStoreId, authContext);
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

  @Get('renewal-requests')
  @RequireContext('store')
  @RequirePermissions('billing.subscription.manage')
  getRenewalRequests(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.billingService.getRenewalRequests(headerStoreId, authContext);
  }

  @Post('renewal-requests')
  @RequireContext('store')
  @RequirePermissions('billing.subscription.manage')
  createRenewalRequest(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.billingService.createRenewalRequest(
      headerStoreId,
      authContext,
      session,
      renewalRequestSchema.parse(payload),
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

  @Post('plans')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  createPlan(
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    if (!session) throw new Error('Missing admin session');
    return this.billingService.createPlan(session.user.tenantId, createPlanSchema.parse(payload));
  }

  @Put('plans/:planId')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  updatePlan(
    @Param('planId') planId: string,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    if (!session) throw new Error('Missing admin session');
    return this.billingService.updatePlan(planId, session.user.tenantId, updatePlanSchema.parse(payload));
  }

  @Delete('plans/:planId')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  deactivatePlan(
    @Param('planId') planId: string,
    @CurrentAuthSession() session: AuthSession | null,
  ) {
    if (!session) throw new Error('Missing admin session');
    return this.billingService.deactivatePlan(planId, session.user.tenantId);
  }

  @Post('stores/:storeId/subscription')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  changeStorePlan(
    @Param('storeId') storeId: string,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    if (!session) throw new Error('Missing admin session');
    return this.billingService.adminChangeStorePlan(
      session.user.tenantId,
      storeId,
      session,
      changeSubscriptionSchema.parse(payload),
    );
  }

  @Get('renewal-requests')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  getRenewalRequests(
    @CurrentAuthSession() session: AuthSession | null,
    @Query('status') status?: string,
  ) {
    if (!session) throw new Error('Missing admin session');
    return this.billingService.getAdminRenewalRequests(session.user.tenantId, status);
  }

  @Post('renewal-requests/:requestId/approve')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  approveRenewalRequest(
    @Param('requestId') requestId: string,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    if (!session) throw new Error('Missing admin session');
    return this.billingService.approveRenewalRequest(
      session.user.tenantId,
      requestId,
      session,
      renewalDecisionSchema.parse(payload).note,
    );
  }

  @Post('renewal-requests/:requestId/reject')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  rejectRenewalRequest(
    @Param('requestId') requestId: string,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    if (!session) throw new Error('Missing admin session');
    return this.billingService.rejectRenewalRequest(
      session.user.tenantId,
      requestId,
      session,
      renewalDecisionSchema.parse(payload).note,
    );
  }
}
