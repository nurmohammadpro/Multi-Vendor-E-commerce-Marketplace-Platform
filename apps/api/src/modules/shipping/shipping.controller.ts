import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { ShippingService } from './shipping.service.js';

const createShipmentSchema = z.object({
  saleId: z.string().uuid().optional(),
  courierProviderId: z.string().uuid().optional(),
  customerName: z.string().min(2).max(200),
  customerPhone: z.string().min(8).max(30),
  deliveryAddress: z.string().min(5),
  district: z.string().max(100).optional(),
  area: z.string().max(100).optional(),
  deliveryFee: z.number().nonnegative().default(0),
  trackingNo: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

const updateShipmentStatusSchema = z.object({
  status: z.enum(['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned']),
  trackingNo: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
  eventPayload: z.record(z.any()).optional(),
});

@Controller('shipping')
@UseGuards(PermissionsGuard)
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('couriers')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  getCouriers(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.shippingService.getCouriers(headerStoreId, authContext);
  }

  @Post('shipments')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  createShipment(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.shippingService.createShipment(
      headerStoreId,
      authContext,
      session,
      createShipmentSchema.parse(payload),
    );
  }

  @Get('shipments')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getShipments(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.shippingService.getShipments(headerStoreId, authContext);
  }

  @Get('shipments/:shipmentId')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getShipment(
    @Param('shipmentId') shipmentId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.shippingService.getShipment(shipmentId, headerStoreId, authContext);
  }

  @Post('shipments/:shipmentId/status')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  updateShipmentStatus(
    @Param('shipmentId') shipmentId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.shippingService.updateShipmentStatus(
      shipmentId,
      headerStoreId,
      authContext,
      session,
      updateShipmentStatusSchema.parse(payload),
    );
  }
}
