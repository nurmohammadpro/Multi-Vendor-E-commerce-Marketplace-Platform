import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AdminAuthContext, AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { StoreService } from './store.service.js';

const storeLogoSchema = z.string().max(2_000_000).refine((value) => {
  if (value.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}, {
  message: 'Store logo must be an image data URL or an http/https URL',
});

const createStoreSchema = z.object({
  name: z.string().min(1).max(200),
  nameBn: z.string().max(200).optional(),
  logoUrl: storeLogoSchema.optional(),
  address: z.string().max(1000).optional(),
  phone: z.string().min(8).max(30),
  email: z.string().email().optional(),
  timezone: z.string().max(100).default('Asia/Dhaka'),
  locale: z.enum(['en', 'bn']).default('en'),
  storeCode: z.string().min(1).max(50).optional(),
  slug: z.string().min(1).max(200).optional(),
});

const adminCreateStoreSchema = createStoreSchema.extend({
  ownerFullName: z.string().min(1).max(200),
  ownerEmail: z.string().email().optional(),
  ownerPhone: z.string().min(8).max(30).optional(),
  ownerPassword: z.string().min(10),
  planCode: z.enum(['basic', 'standard', 'pro', 'wholesale']).default('basic'),
}).refine((value) => Boolean(value.ownerEmail || value.ownerPhone), {
  message: 'ownerEmail or ownerPhone is required',
});

const resetOwnerPasswordSchema = z.object({
  password: z.string().min(10),
});

const updateStoreSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameBn: z.string().max(200).nullable().optional(),
  logoUrl: storeLogoSchema.nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
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

const employeeAccessProfileSchema = z.object({
  joinDate: z.string().date().optional(),
  monthlySalary: z.number().nonnegative().optional(),
  employmentStatus: z.enum(['active', 'inactive', 'terminated']).optional(),
  employmentType: z.string().min(1).max(50).optional(),
  designation: z.string().min(1).max(100).optional(),
  department: z.string().min(1).max(100).optional(),
  emergencyContactName: z.string().min(1).max(200).optional(),
  emergencyContactPhone: z.string().min(1).max(30).optional(),
  salaryPaymentMode: z.enum(['cash', 'bank_transfer', 'mobile_banking']).optional(),
  bankName: z.string().min(1).max(150).optional(),
  bankAccountName: z.string().min(1).max(200).optional(),
  bankAccountNumber: z.string().min(1).max(80).optional(),
  mobileBankingType: z.string().min(1).max(50).optional(),
  mobileBankingNumber: z.string().min(1).max(30).optional(),
  educationSummary: z.string().max(3000).optional(),
  experienceSummary: z.string().max(3000).optional(),
  trainingSummary: z.string().max(3000).optional(),
  note: z.string().max(1000).optional(),
});

const createStaffMemberSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().min(8).max(30),
  email: z.string().email(),
  password: z.string().min(10),
  address: z.string().min(1).max(1000),
  roleCode: z.enum(['store_manager', 'store_salesman']),
  locationId: z.string().uuid().optional(),
}).extend(employeeAccessProfileSchema.shape);

const updateMembershipSchema = z.object({
  status: z.enum(['active', 'suspended', 'removed']).optional(),
  roleCode: z.enum(['store_owner', 'store_manager', 'store_salesman']).optional(),
  locationId: z.string().uuid().nullable().optional(),
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().min(8).max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  password: z.string().min(10).optional(),
  address: z.string().min(1).max(1000).nullable().optional(),
}).extend(employeeAccessProfileSchema.partial().shape).refine((value) => Boolean(
  value.status
  || value.roleCode
  || value.locationId !== undefined
  || value.fullName
  || value.phone !== undefined
  || value.email !== undefined
  || value.password
  || value.address !== undefined
  || value.joinDate
  || value.monthlySalary !== undefined
  || value.employmentStatus
  || value.employmentType
  || value.designation
  || value.department
  || value.emergencyContactName
  || value.emergencyContactPhone
  || value.salaryPaymentMode
  || value.bankName
  || value.bankAccountName
  || value.bankAccountNumber
  || value.mobileBankingType
  || value.mobileBankingNumber
  || value.educationSummary
  || value.experienceSummary
  || value.trainingSummary
  || value.note !== undefined
), {
  message: 'At least one membership or profile field is required',
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
    @CurrentAuthSession() session: AuthSession | null,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeService.getStaff(storeId, headerStoreId, authContext, session, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':storeId/staff')
  @RequireContext('store')
  @RequirePermissions('store.staff.manage')
  createStaffMember(
    @Param('storeId') storeId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeService.createStaffMember(
      storeId,
      headerStoreId,
      authContext,
      session,
      createStaffMemberSchema.parse(payload),
    );
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
    return this.storeService.adminCreateStore(session, adminCreateStoreSchema.parse(payload));
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
    @Query('force') force?: string,
  ) {
    return this.storeService.adminDeleteStore(storeId, authContext, session, force === 'true');
  }

  @Post(':storeId/owner-password')
  @RequireContext('admin')
  @RequirePermissions('platform.store.manage')
  resetOwnerPassword(
    @Param('storeId') storeId: string,
    @CurrentAuthContext() authContext: AdminAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeService.adminResetStoreOwnerPassword(
      storeId,
      authContext,
      session,
      resetOwnerPasswordSchema.parse(payload),
    );
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
