import { Module } from '@nestjs/common';

import { AdminBillingController, BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';

@Module({
  controllers: [BillingController, AdminBillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
