import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';

@Controller('webhooks/payments')
export class PaymentsWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':provider')
  async handleWebhook(
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string>,
    @Body() body: Record<string, unknown>,
  ) {
    const signature = headers['x-signature'] || headers['signature'] || headers['x-ssl-signature'] || '';
    return this.paymentsService.handleWebhook(provider, body, signature);
  }
}
