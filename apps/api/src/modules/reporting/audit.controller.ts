import { Controller, Get, UseGuards } from '@nestjs/common';

import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { ReportingService } from './reporting.service.js';

@Controller('audit')
@UseGuards(PermissionsGuard)
export class AuditController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('logs')
  @RequireContext('admin')
  @RequirePermissions('platform.report.view')
  getAuditLogs() {
    return this.reportingService.getAuditLogs();
  }
}
