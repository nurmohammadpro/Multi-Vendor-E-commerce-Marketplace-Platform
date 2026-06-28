import { Module } from '@nestjs/common';

import { AdminStoreController, StaffInvitationController, StoreController } from './store.controller.js';
import { StoreService } from './store.service.js';

@Module({
  controllers: [StoreController, StaffInvitationController, AdminStoreController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
