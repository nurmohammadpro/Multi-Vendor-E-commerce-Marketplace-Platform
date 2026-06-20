import { Module } from '@nestjs/common';

import { AuditController } from './audit.controller.js';
import { PlatformReportsController } from './platform-reports.controller.js';
import { ReportingService } from './reporting.service.js';
import { StoreReportsController } from './store-reports.controller.js';

@Module({
  controllers: [StoreReportsController, PlatformReportsController, AuditController],
  providers: [ReportingService],
})
export class ReportingModule {}
