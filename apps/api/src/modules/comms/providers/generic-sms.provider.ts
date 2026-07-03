import type { SendSmsInput, SmsProvider, SmsResult } from './sms-provider.interface.js';

export class GenericSmsProvider implements SmsProvider {
  readonly providerCode = 'generic-sms';
  readonly displayName = 'Generic SMS Gateway';

  private apiUrl: string;
  private apiKey: string;
  private senderId: string;

  constructor(config: { apiUrl: string; apiKey: string; senderId?: string }) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    this.senderId = config.senderId || 'MarketOne';
  }

  async send(input: SendSmsInput): Promise<SmsResult> {
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        senderid: input.senderId || this.senderId,
        contacts: input.to,
        msg: input.body,
        type: 'text',
      });

      const response = await fetch(`${this.apiUrl}?${params.toString()}`);
      const data = await response.json() as Record<string, unknown>;
      const messageId = (data.message_id as string) || `sms-${Date.now()}`;

      if (!response.ok) {
        return { messageId, status: 'failed', error: (data.error as string) || 'SMS gateway error' };
      }

      return { messageId, status: 'sent' };
    } catch (err) {
      return { messageId: `sms-err-${Date.now()}`, status: 'failed', error: (err as Error).message };
    }
  }

  async sendBulk(inputs: SendSmsInput[]): Promise<SmsResult[]> {
    return Promise.all(inputs.map((input) => this.send(input)));
  }
}
