import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { StoreService } from './store.service.js';

const inviteStaffSchema = z.object({
  invitedEmail: z.string().email().optional(),
  invitedPhone: z.string().min(8).optional(),
  roleCode: z.enum(['store_owner', 'store_manager', 'store_salesman']),
}).refine((value) => Boolean(value.invitedEmail || value.invitedPhone), {
  message: 'invitedEmail or invitedPhone is required',
});

const updateMembershipSchema = z.object({
  status: z.enum(['active', 'suspended', 'removed']).optional(),
  roleCode: z.enum(['store_owner', 'store_manager', 'store_salesman']).optional(),
}).refine((value) => Boolean(value.status || value.roleCode), {
  message: 'status or roleCode is required',
});

@Controller('stores')
@UseGuards(PermissionsGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get('my')
  @RequirePermissions('inventory.view')
  getMyStores(@CurrentAuthSession() session: AuthSession | null) {
    return this.storeService.getMyStores(session);
  }

  @Get(':storeId')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  getStore(
    @Param('storeId') storeId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.storeService.getStore(storeId, headerStoreId, authContext);
  }

  @Get(':storeId/staff')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getStaff(
    @Param('storeId') storeId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.storeService.getStaff(storeId, headerStoreId, authContext);
  }

  @Post(':storeId/invitations')
  @RequireContext('store')
  @RequirePermissions('store.staff.manage')
  inviteStaff(
    @Param('storeId') storeId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeService.inviteStaff(
      storeId,
      headerStoreId,
      authContext,
      session,
      inviteStaffSchema.parse(payload),
    );
  }

  @Patch(':storeId/staff/:membershipId')
  @RequireContext('store')
  @RequirePermissions('store.staff.manage')
  updateMembership(
    @Param('storeId') storeId: string,
    @Param('membershipId') membershipId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeService.updateMembership(
      storeId,
      membershipId,
      headerStoreId,
      authContext,
      session,
      updateMembershipSchema.parse(payload),
    );
  }
}
