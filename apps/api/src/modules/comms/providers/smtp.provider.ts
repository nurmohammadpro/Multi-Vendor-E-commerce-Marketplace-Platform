import type { EmailProvider, EmailResult, SendEmailInput } from './email-provider.interface.js';

export class SmtpProvider implements EmailProvider {
  readonly providerCode = 'smtp';
  readonly displayName = 'SMTP';

  private host: string;
  private port: number;
  private user: string;
  private pass: string;
  private defaultFrom: string;

  constructor(config: { host: string; port: number; user: string; pass: string; defaultFrom?: string }) {
    this.host = config.host;
    this.port = config.port;
    this.user = config.user;
    this.pass = config.pass;
    this.defaultFrom = config.defaultFrom || 'Merch Flow <noreply@marketone.com.bd>';
  }

  async send(input: SendEmailInput): Promise<EmailResult> {
    try {
      // Simple SMTP send via fetch to a mail relay API.
      // For direct SMTP, use nodemailer. This uses a generic HTTP mail relay pattern.
      const response = await fetch(`https://${this.host}:${this.port}/api/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${this.user}:${this.pass}`).toString('base64')}`,
        },
        body: JSON.stringify({
          from: input.from || this.defaultFrom,
          to: input.to,
          subject: input.subject,
          html: input.htmlBody,
          text: input.textBody,
        }),
      });
      const messageId = `smtp-${Date.now()}`;
      if (!response.ok) {
        return { messageId, status: 'failed', error: `SMTP send failed: ${response.status}` };
      }
      return { messageId, status: 'sent' };
    } catch (err) {
      return { messageId: `smtp-err-${Date.now()}`, status: 'failed', error: (err as Error).message };
    }
  }

  async sendBulk(inputs: SendEmailInput[]): Promise<EmailResult[]> {
    return Promise.all(inputs.map((input) => this.send(input)));
  }
}
