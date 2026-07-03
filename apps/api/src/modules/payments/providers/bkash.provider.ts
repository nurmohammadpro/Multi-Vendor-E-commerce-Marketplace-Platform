import type { InitiatePaymentInput, PaymentProvider, PaymentResult, RefundResult } from './payment-provider.interface.js';

interface BkashCredentials {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  sandbox: boolean;
}

export class BkashProvider implements PaymentProvider {
  readonly providerCode = 'bkash';
  readonly displayName = 'bKash';

  private tokenCache = new Map<string, { token: string; expiresAt: number }>();

  private getBaseUrl(sandbox: boolean): string {
    return sandbox
      ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta'
      : 'https://tokenized.pay.bka.sh/v1.2.0-beta';
  }

  private parseCredentials(credentials: Record<string, string>): BkashCredentials {
    return {
      appKey: credentials.app_key || '',
      appSecret: credentials.app_secret || '',
      username: credentials.username || '',
      password: credentials.password || '',
      sandbox: credentials.sandbox === 'true',
    };
  }

  async initiatePayment(credentials: Record<string, string>, input: InitiatePaymentInput): Promise<PaymentResult> {
    const creds = this.parseCredentials(credentials);
    const token = await this.getGrantToken(creds);
    const baseUrl = this.getBaseUrl(creds.sandbox);
    const apiBase = process.env.API_BASE_URL || 'http://localhost:4000/v1';

    const body = {
      mode: '0011',
      payerReference: input.customerPhone || '01700000000',
      callbackURL: `${apiBase}/webhooks/payments/bkash`,
      amount: String(input.amount),
      currency: input.currency || 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: input.orderReference,
    };

    const response = await fetch(`${baseUrl}/tokenized/checkout/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'X-APP-Key': creds.appKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      return { transactionRef: `BKASH-ERR-${Date.now()}`, status: 'failed', rawResponse: data };
    }

    return {
      transactionRef: `BKASH-${data.paymentID || Date.now()}`,
      providerTransactionId: data.paymentID as string,
      status: 'pending',
      rawResponse: data,
      redirectUrl: data.bkashURL as string,
    };
  }

  async queryPaymentStatus(credentials: Record<string, string>, providerTransactionId: string): Promise<PaymentResult> {
    const creds = this.parseCredentials(credentials);
    const token = await this.getGrantToken(creds);
    const baseUrl = this.getBaseUrl(creds.sandbox);
    const body = { paymentID: providerTransactionId };

    const response = await fetch(`${baseUrl}/tokenized/checkout/payment/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token, 'X-APP-Key': creds.appKey },
      body: JSON.stringify(body),
    });

    const data = await response.json() as Record<string, unknown>;
    const st = (data.transactionStatus as string || '').toLowerCase();
    const mapped = st === 'completed' ? 'completed' as const : st === 'failed' || st === 'cancelled' ? 'failed' as const : 'pending' as const;

    return { transactionRef: `BKASH-${providerTransactionId}`, providerTransactionId, status: mapped, rawResponse: data };
  }

  async processRefund(credentials: Record<string, string>, providerTransactionId: string, amount: number): Promise<RefundResult> {
    const creds = this.parseCredentials(credentials);
    const token = await this.getGrantToken(creds);
    const baseUrl = this.getBaseUrl(creds.sandbox);

    const body = {
      paymentID: providerTransactionId,
      amount: String(amount),
      trxID: providerTransactionId,
      sku: 'refund',
      reason: 'Customer refund',
    };

    const response = await fetch(`${baseUrl}/tokenized/checkout/payment/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token, 'X-APP-Key': creds.appKey },
      body: JSON.stringify(body),
    });

    const data = await response.json() as Record<string, unknown>;

    return {
      refundTransactionRef: `BKASH-REF-${data.refundTrxID || Date.now()}`,
      status: response.ok ? 'completed' : 'failed',
      rawResponse: data,
    };
  }

  validateWebhookSignature(_p: Record<string, unknown>, _s: string, _c: Record<string, string>): boolean {
    return true;
  }

  private async getGrantToken(creds: BkashCredentials): Promise<string> {
    const cacheKey = `${creds.appKey}:${creds.username}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

    const baseUrl = this.getBaseUrl(creds.sandbox);
    const body = { app_key: creds.appKey, app_secret: creds.appSecret };

    const response = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', username: creds.username, password: creds.password },
      body: JSON.stringify(body),
    });

    const data = await response.json() as Record<string, unknown>;
    const idToken = data.id_token as string;

    if (idToken) {
      this.tokenCache.set(cacheKey, { token: idToken, expiresAt: Date.now() + 3300000 });
    }
    return idToken || '';
  }
}
