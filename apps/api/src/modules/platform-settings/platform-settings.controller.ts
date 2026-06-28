import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AdminAuthContext, AuthSession } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { PlatformSettingsService } from './platform-settings.service.js';

const updatePlatformSettingsSchema = z.object({
  accessPolicy: z.object({
    ownerControlsDestructiveActions: z.boolean().optional(),
    managerCanManageSalesmen: z.boolean().optional(),
    managerCanRemoveSalesmen: z.boolean().optional(),
  }).optional(),
  defaults: z.object({
    operatingHours: z.string().max(50).optional(),
    notificationsEmail: z.string().email().optional(),
    reportWindowDays: z.number().int().positive().optional(),
  }).optional(),
  governance: z.object({
    requireConfirmationForDeletes: z.boolean().optional(),
    auditRetentionDays: z.number().int().positive().optional(),
    changeReviewMinutes: z.number().int().positive().optional(),
  }).optional(),
});

@Controller('platform/settings')
@UseGuards(PermissionsGuard)
export class PlatformSettingsController {
  constructor(private readonly platformSettingsService: PlatformSettingsService) {}

  @Get()
  @RequireContext('admin')
  @RequirePermissions('platform.settings.manage')
  getSettings(
    @CurrentAuthContext() authContext: AdminAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
  ) {
    return this.platformSettingsService.getSettingsForSession(authContext, session);
  }

  @Patch()
  @RequireContext('admin')
  @RequirePermissions('platform.settings.manage')
  updateSettings(
    @CurrentAuthContext() authContext: AdminAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.platformSettingsService.updateSettings(
      authContext,
      session,
      updatePlatformSettingsSchema.parse(payload),
    );
  }
}
