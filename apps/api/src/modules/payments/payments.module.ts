import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsWebhookController } from './payments.webhook.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
