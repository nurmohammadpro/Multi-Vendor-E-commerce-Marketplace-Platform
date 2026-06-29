import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext } from '../auth/current-auth.decorator.js';
import type { StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { ReportingService } from './reporting.service.js';

const storeAuditQuerySchema = z.object({
  search: z.string().max(120).optional(),
  actionCode: z.string().max(120).optional(),
  resourceType: z.string().max(120).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  page: z.coerce.number().int().positive().default(1),
});

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

  @Get('store-logs')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getStoreAuditLogs(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('search') search: string | undefined,
    @Query('actionCode') actionCode: string | undefined,
    @Query('resourceType') resourceType: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
  ) {
    return this.reportingService.getStoreAuditLogs(
      headerStoreId,
      authContext,
      storeAuditQuerySchema.parse({
        search,
        actionCode,
        resourceType,
        limit,
        page,
      }),
    );
  }
}
