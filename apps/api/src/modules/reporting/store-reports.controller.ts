import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { ReportingService } from './reporting.service.js';

const createExportJobSchema = z.object({
  exportType: z.enum(['sales', 'inventory', 'billing', 'support']),
  filters: z.record(z.any()).default({}),
});

@Controller('reports')
@UseGuards(PermissionsGuard)
export class StoreReportsController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('store/sales')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getStoreSales(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.reportingService.getStoreSalesReport(headerStoreId, authContext);
  }

  @Get('store/inventory')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  getStoreInventory(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.reportingService.getStoreInventoryReport(headerStoreId, authContext);
  }

  @Post('exports')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  createExportJob(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.reportingService.createExportJob(
      headerStoreId,
      authContext,
      session,
      createExportJobSchema.parse(payload),
    );
  }
}
