export interface SendSmsInput {
  to: string;
  body: string;
  senderId?: string;
}

export interface SmsResult {
  messageId: string;
  status: 'sent' | 'failed' | 'queued';
  error?: string;
}

export interface SmsProvider {
  send(input: SendSmsInput): Promise<SmsResult>;
  sendBulk(inputs: SendSmsInput[]): Promise<SmsResult[]>;
}
