import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module.js';
import { AdminStoreController, StaffInvitationController, StoreController } from './store.controller.js';
import { StoreService } from './store.service.js';

@Module({
  imports: [BillingModule],
  controllers: [StoreController, StaffInvitationController, AdminStoreController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
