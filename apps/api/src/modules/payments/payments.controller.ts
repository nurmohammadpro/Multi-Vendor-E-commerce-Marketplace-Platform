import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
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

@Controller('payments')
@UseGuards(PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
    return this.paymentsService.updateGateway(
      gatewayId,
      headerStoreId,
      authContext,
      updateGatewaySchema.parse(payload),
    );
  }
}
