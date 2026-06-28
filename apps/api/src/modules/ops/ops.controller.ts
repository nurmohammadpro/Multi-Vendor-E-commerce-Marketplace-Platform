import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { OpsService } from './ops.service.js';

@Controller('admin/ops')
@UseGuards(PermissionsGuard)
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('outbox')
  @RequireContext('admin')
  @RequirePermissions('platform.report.view')
  listOutbox(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.opsService.listOutbox(status, limit ? Number(limit) : undefined);
  }

  @Post('outbox/process')
  @RequireContext('admin')
  @RequirePermissions('platform.report.view')
  processOutbox() {
    return this.opsService.processOutboxBatch();
  }

  @Get('exports')
  @RequireContext('admin')
  @RequirePermissions('platform.report.view')
  listExports(@Query('status') status?: string) {
    return this.opsService.listExportJobs(status);
  }

  @Post('exports/:jobId/process')
  @RequireContext('admin')
  @RequirePermissions('platform.report.view')
  processExport(@Param('jobId') jobId: string) {
    return this.opsService.processExportJob(jobId);
  }

  @Get('notifications')
  @RequireContext('admin')
  @RequirePermissions('platform.notification.manage')
  listNotifications(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.opsService.listNotifications(status, limit ? Number(limit) : undefined);
  }

  @Post('notifications/process')
  @RequireContext('admin')
  @RequirePermissions('platform.notification.manage')
  processNotifications() {
    return this.opsService.processNotificationsBatch();
  }

  @Post('broadcasts/:broadcastId/process')
  @RequireContext('admin')
  @RequirePermissions('platform.broadcast.send')
  processBroadcast(@Param('broadcastId') broadcastId: string) {
    return this.opsService.processBroadcast(broadcastId);
  }
}
