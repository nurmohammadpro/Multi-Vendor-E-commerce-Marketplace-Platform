import { Controller, Get, UseGuards } from '@nestjs/common';

import { RequireContext, RequirePermissions } from './rbac.decorators.js';
import { PermissionsGuard } from './permissions.guard.js';

@Controller('admin')
@UseGuards(PermissionsGuard)
export class AdminSampleController {
  @Get('overview')
  @RequireContext('admin')
  @RequirePermissions('platform.report.view')
  getOverview() {
    return {
      ok: true,
      scope: 'admin',
      message: 'Admin overview route is protected',
    };
  }
}
