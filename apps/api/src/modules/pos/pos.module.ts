import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module.js';
import { PosController } from './pos.controller.js';
import { PosService } from './pos.service.js';

@Module({
  imports: [BillingModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
