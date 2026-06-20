import { Controller, Get, UseGuards } from '@nestjs/common';

import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { ReportingService } from './reporting.service.js';

@Controller('reports/platform')
@UseGuards(PermissionsGuard)
export class PlatformReportsController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('overview')
  @RequireContext('admin')
  @RequirePermissions('platform.report.view')
  getOverview() {
    return this.reportingService.getPlatformOverview();
  }

  @Get('payments')
  @RequireContext('admin')
  @RequirePermissions('platform.payment.monitor')
  getPayments() {
    return this.reportingService.getPlatformPayments();
  }
}
