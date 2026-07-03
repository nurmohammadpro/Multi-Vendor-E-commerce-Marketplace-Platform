export interface SendEmailInput {
  to: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  from?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
}

export interface EmailResult {
  messageId: string;
  status: 'sent' | 'failed';
  error?: string;
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<EmailResult>;
  sendBulk(inputs: SendEmailInput[]): Promise<EmailResult[]>;
}
