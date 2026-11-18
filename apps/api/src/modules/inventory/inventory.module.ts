import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module.js';
import { DeviceSerialsController } from './device-serials.controller.js';
import { DeviceSerialsService } from './device-serials.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { TransfersService } from './transfers.service.js';

@Module({
  imports: [BillingModule],
  controllers: [InventoryController, DeviceSerialsController],
  providers: [InventoryService, DeviceSerialsService, TransfersService],
  exports: [InventoryService],
})
export class InventoryModule {}
