import { Module } from '@nestjs/common';
import { CommsModule } from '../comms/comms.module.js';
import { OpsController } from './ops.controller.js';
import { OpsService } from './ops.service.js';

@Module({
  imports: [CommsModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
