import { Controller, Get, Headers, UseGuards } from '@nestjs/common';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { SupportService } from './support.service.js';

@Controller()
@UseGuards(PermissionsGuard)
export class NotificationsController {
  constructor(private readonly supportService: SupportService) {}

  @Get('notifications')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getStoreNotifications(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
  ) {
    return this.supportService.getStoreNotifications(headerStoreId, authContext, session);
  }

  @Get('admin/notifications')
  @RequireContext('admin')
  @RequirePermissions('platform.notification.manage')
  getAdminNotifications(@CurrentAuthSession() session: AuthSession | null) {
    return this.supportService.getAdminNotifications(session);
  }
}
