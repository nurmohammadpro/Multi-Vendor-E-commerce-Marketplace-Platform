import { Module } from '@nestjs/common';

import { StoreController } from './store.controller.js';
import { StoreService } from './store.service.js';

@Module({
  controllers: [StoreController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
