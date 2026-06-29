import { Module } from '@nestjs/common';

import { StoreOpsController } from './store-ops.controller.js';
import { StoreOpsService } from './store-ops.service.js';

@Module({
  controllers: [StoreOpsController],
  providers: [StoreOpsService],
})
export class StoreOpsModule {}
