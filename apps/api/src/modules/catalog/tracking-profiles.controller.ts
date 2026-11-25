import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext } from '../auth/current-auth.decorator.js';
import type { StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { TrackingProfilesService } from './tracking-profiles.service.js';

const createProfileSchema = z.object({
  name: z.string().min(1).max(150),
  categoryId: z.string().uuid().optional(),
  isGlobal: z.boolean().default(false),
  fields: z.array(z.object({
    fieldKey: z.string().min(1).max(50),
    fieldLabel: z.string().min(1).max(100),
    fieldType: z.enum(['text', 'number', 'imei', 'date']).default('text'),
    isRequired: z.boolean().default(false),
    isUnique: z.boolean().default(true),
    validationRules: z.record(z.any()).default({}),
    sortOrder: z.number().int().nonnegative().default(0),
  })).optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  isGlobal: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const addFieldSchema = z.object({
  fieldKey: z.string().min(1).max(50),
  fieldLabel: z.string().min(1).max(100),
  fieldType: z.enum(['text', 'number', 'imei', 'date']).default('text'),
  isRequired: z.boolean().default(false),
  isUnique: z.boolean().default(true),
  validationRules: z.record(z.any()).default({}),
  sortOrder: z.number().int().nonnegative().default(0),
});

const updateFieldSchema = z.object({
  fieldLabel: z.string().min(1).max(100).optional(),
  fieldType: z.enum(['text', 'number', 'imei', 'date']).optional(),
  isRequired: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  validationRules: z.record(z.any()).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

@UseGuards(PermissionsGuard)
@Controller('catalog/tracking-profiles')
export class TrackingProfilesController {
  constructor(private readonly trackingProfilesService: TrackingProfilesService) {}

  @Get()
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  async listProfiles(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    const tenantId = await this.trackingProfilesService.resolveTenantId(authContext?.storeId || headerStoreId);
    return this.trackingProfilesService.listProfiles(tenantId);
  }

  @Get('by-category/:categoryId')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  async getProfileByCategoryId(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Param('categoryId') categoryId: string,
  ) {
    const tenantId = await this.trackingProfilesService.resolveTenantId(authContext?.storeId || headerStoreId);
    return this.trackingProfilesService.getProfileByCategoryId(tenantId, categoryId);
  }

  @Get(':profileId')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  async getProfile(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Param('profileId') profileId: string,
  ) {
    const tenantId = await this.trackingProfilesService.resolveTenantId(authContext?.storeId || headerStoreId);
    return this.trackingProfilesService.getProfile(tenantId, profileId);
  }

  @Post()
  @RequireContext('store')
  @RequirePermissions('inventory.manage')
  async createProfile(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() body: unknown,
  ) {
    const tenantId = await this.trackingProfilesService.resolveTenantId(authContext?.storeId || headerStoreId);
    return this.trackingProfilesService.createProfile(tenantId, createProfileSchema.parse(body));
  }

  @Patch(':profileId')
  @RequireContext('store')
  @RequirePermissions('inventory.manage')
  async updateProfile(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Param('profileId') profileId: string,
    @Body() body: unknown,
  ) {
    const tenantId = await this.trackingProfilesService.resolveTenantId(authContext?.storeId || headerStoreId);
    return this.trackingProfilesService.updateProfile(tenantId, profileId, updateProfileSchema.parse(body));
  }

  @Delete(':profileId')
  @RequireContext('store')
  @RequirePermissions('inventory.manage')
  async deleteProfile(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Param('profileId') profileId: string,
  ) {
    const tenantId = await this.trackingProfilesService.resolveTenantId(authContext?.storeId || headerStoreId);
    return this.trackingProfilesService.deleteProfile(tenantId, profileId);
  }

  @Post(':profileId/fields')
  @RequireContext('store')
  @RequirePermissions('inventory.manage')
  async addField(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Param('profileId') profileId: string,
    @Body() body: unknown,
  ) {
    const tenantId = await this.trackingProfilesService.resolveTenantId(authContext?.storeId || headerStoreId);
    return this.trackingProfilesService.addField(tenantId, profileId, addFieldSchema.parse(body));
  }

  @Patch(':profileId/fields/:fieldId')
  @RequireContext('store')
  @RequirePermissions('inventory.manage')
  async updateField(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Param('profileId') profileId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
  ) {
    const tenantId = await this.trackingProfilesService.resolveTenantId(authContext?.storeId || headerStoreId);
    return this.trackingProfilesService.updateField(tenantId, fieldId, updateFieldSchema.parse(body));
  }

  @Delete(':profileId/fields/:fieldId')
  @RequireContext('store')
  @RequirePermissions('inventory.manage')
  async deleteField(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Param('profileId') profileId: string,
    @Param('fieldId') fieldId: string,
  ) {
    const tenantId = await this.trackingProfilesService.resolveTenantId(authContext?.storeId || headerStoreId);
    return this.trackingProfilesService.deleteField(tenantId, fieldId);
  }
}
