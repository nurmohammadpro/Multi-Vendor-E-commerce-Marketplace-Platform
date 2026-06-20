import { Module } from '@nestjs/common';

import { AdminBroadcastController } from './admin-broadcast.controller.js';
import { AdminSupportController } from './admin-support.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';

@Module({
  controllers: [SupportController, AdminSupportController, NotificationsController, AdminBroadcastController],
  providers: [SupportService],
})
export class SupportModule {}
