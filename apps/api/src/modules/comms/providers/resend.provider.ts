import type { EmailProvider, EmailResult, SendEmailInput } from './email-provider.interface.js';

export class ResendProvider implements EmailProvider {
  readonly providerCode = 'resend';
  readonly displayName = 'Resend';

  private apiKey: string;
  private defaultFrom: string;

  constructor(config: { apiKey: string; defaultFrom?: string }) {
    this.apiKey = config.apiKey;
    this.defaultFrom = config.defaultFrom || 'Merch Flow <noreply@marketone.com.bd>';
  }

  async send(input: SendEmailInput): Promise<EmailResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: input.from || this.defaultFrom,
          to: input.to,
          subject: input.subject,
          html: input.htmlBody,
          text: input.textBody,
          attachments: input.attachments?.map((a) => ({
            filename: a.filename,
            content: typeof a.content === 'string' ? a.content : Buffer.from(a.content).toString('base64'),
          })),
        }),
      });

      const data = await response.json() as Record<string, unknown>;
      const messageId = (data.id as string) || `resend-${Date.now()}`;

      if (!response.ok) {
        return { messageId, status: 'failed', error: (data.message as string) || 'Resend API error' };
      }

      return { messageId, status: 'sent' };
    } catch (err) {
      return { messageId: `resend-err-${Date.now()}`, status: 'failed', error: (err as Error).message };
    }
  }

  async sendBulk(inputs: SendEmailInput[]): Promise<EmailResult[]> {
    return Promise.all(inputs.map((input) => this.send(input)));
  }
}
