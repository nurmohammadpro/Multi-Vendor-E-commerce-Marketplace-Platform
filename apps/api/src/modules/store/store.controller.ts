import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AdminAuthContext, AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { StoreService } from './store.service.js';

const createStoreSchema = z.object({
  storeCode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  nameBn: z.string().max(200).optional(),
  slug: z.string().min(1).max(200),
  phone: z.string().min(8).max(30),
  email: z.string().email().optional(),
  timezone: z.string().max(100).default('Asia/Dhaka'),
  locale: z.enum(['en', 'bn']).default('en'),
});

const updateStoreSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameBn: z.string().max(200).nullable().optional(),
  phone: z.string().min(8).max(30).optional(),
  email: z.string().email().nullable().optional(),
  status: z.enum(['pending', 'active', 'suspended', 'inactive']).optional(),
});

const updateStoreSettingsSchema = z.object({
  timezone: z.string().max(100).optional(),
  currencyCode: z.string().max(10).optional(),
  locale: z.enum(['en', 'bn']).optional(),
  receiptFooter: z.string().nullable().optional(),
  invoicePrefix: z.string().max(20).nullable().optional(),
  allowNegativeStock: z.boolean().optional(),
  lowStockThresholdDefault: z.number().int().nonnegative().nullable().optional(),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(16),
  fullName: z.string().min(1).max(200),
  password: z.string().min(10),
});

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

  @Post()
  createStore(
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeService.createStore(session, createStoreSchema.parse(payload));
  }

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

  @Patch(':storeId')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  updateStore(
    @Param('storeId') storeId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeService.updateStore(
      storeId,
      headerStoreId,
      authContext,
      session,
      updateStoreSchema.parse(payload),
    );
  }

  @Get(':storeId/settings')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  getSettings(
    @Param('storeId') storeId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.storeService.getSettings(storeId, headerStoreId, authContext);
  }

  @Patch(':storeId/settings')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  updateSettings(
    @Param('storeId') storeId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeService.updateSettings(
      storeId,
      headerStoreId,
      authContext,
      session,
      updateStoreSettingsSchema.parse(payload),
    );
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

@Controller('admin/stores')
@UseGuards(PermissionsGuard)
export class AdminStoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get()
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  listStores(@CurrentAuthContext() authContext: AdminAuthContext | null) {
    return this.storeService.listPlatformStores(authContext);
  }

  @Post()
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  createStore(@CurrentAuthSession() session: AuthSession | null, @Body() payload: unknown) {
    return this.storeService.createStore(session, createStoreSchema.parse(payload));
  }

  @Patch(':storeId')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  updateStore(
    @Param('storeId') storeId: string,
    @CurrentAuthContext() authContext: AdminAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeService.adminUpdateStore(storeId, authContext, session, updateStoreSchema.parse(payload));
  }

  @Patch(':storeId/status')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  updateStoreStatus(
    @Param('storeId') storeId: string,
    @CurrentAuthContext() authContext: AdminAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    const parsed = z.object({
      status: z.enum(['pending', 'active', 'suspended', 'inactive']),
    }).parse(payload);

    return this.storeService.adminUpdateStoreStatus(storeId, authContext, session, parsed.status);
  }

  @Delete(':storeId')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  deleteStore(
    @Param('storeId') storeId: string,
    @CurrentAuthContext() authContext: AdminAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
  ) {
    return this.storeService.adminDeleteStore(storeId, authContext, session);
  }
}

@Controller('staff')
export class StaffInvitationController {
  constructor(private readonly storeService: StoreService) {}

  @Post('invitations/:token/accept')
  acceptInvitation(@Param('token') token: string, @Body() payload: unknown) {
    const parsed = acceptInvitationSchema.parse({ ...acceptInvitationSchema.parse(payload), token });
    return this.storeService.acceptInvitation(parsed);
  }
}
