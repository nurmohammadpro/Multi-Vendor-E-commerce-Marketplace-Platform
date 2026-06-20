import { Controller, Get, Headers, UseGuards } from '@nestjs/common';

import { RequireContext, RequirePermissions } from './rbac.decorators.js';
import { PermissionsGuard } from './permissions.guard.js';

@Controller('store')
@UseGuards(PermissionsGuard)
export class StoreSampleController {
  @Get('inventory/summary')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  getInventorySummary(@Headers('x-store-id') storeId?: string) {
    return {
      ok: true,
      scope: 'store',
      storeId: storeId ?? null,
      message: 'Store inventory summary route is protected',
    };
  }
}
