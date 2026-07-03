import type { InitiatePaymentInput, PaymentProvider, PaymentResult, RefundResult } from './payment-provider.interface.js';

interface RocketCredentials {
  merchantId: string;
  merchantPassword: string;
  sandbox: boolean;
}

export class RocketProvider implements PaymentProvider {
  readonly providerCode = 'rocket';
  readonly displayName = 'Rocket (DBBL)';

  private getBaseUrl(sandbox: boolean): string {
    return sandbox
      ? 'https://sandbox.rocketpay.dutchbanglabank.com'
      : 'https://rocketpay.dutchbanglabank.com';
  }

  private parseCredentials(credentials: Record<string, string>): RocketCredentials {
    return {
      merchantId: credentials.merchant_id || '',
      merchantPassword: credentials.merchant_password || '',
      sandbox: credentials.sandbox === 'true',
    };
  }

  async initiatePayment(credentials: Record<string, string>, input: InitiatePaymentInput): Promise<PaymentResult> {
    const creds = this.parseCredentials(credentials);
    const baseUrl = this.getBaseUrl(creds.sandbox);
    const transactionRef = `ROCKET-${input.orderReference}-${Date.now()}`;
    const apiBase = process.env.API_BASE_URL || 'http://localhost:4000/v1';

    const body = {
      merchantId: creds.merchantId,
      merchantPassword: creds.merchantPassword,
      orderId: transactionRef,
      amount: String(input.amount),
      currency: input.currency || 'BDT',
      customerMobileNo: input.customerPhone || '01700000000',
      description: `Order ${input.orderReference}`,
      callbackUrl: `${apiBase}/webhooks/payments/rocket`,
    };

    try {
      const response = await fetch(`${baseUrl}/api/merchant/createOrder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) return { transactionRef, status: 'failed', rawResponse: data };

      return {
        transactionRef,
        providerTransactionId: (data.transactionId as string) || transactionRef,
        status: 'pending',
        rawResponse: data,
      };
    } catch (err) {
      return { transactionRef, status: 'failed', rawResponse: { error: (err as Error).message } };
    }
  }

  async queryPaymentStatus(credentials: Record<string, string>, providerTransactionId: string): Promise<PaymentResult> {
    const creds = this.parseCredentials(credentials);
    const baseUrl = this.getBaseUrl(creds.sandbox);

    try {
      const authHeader = Buffer.from(`${creds.merchantId}:${creds.merchantPassword}`).toString('base64');
      const response = await fetch(`${baseUrl}/api/merchant/queryStatus/${creds.merchantId}/${providerTransactionId}`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authHeader}` },
      });
      const data = await response.json() as Record<string, unknown>;
      const rocketStatus = (data.status as string || '').toLowerCase();

      let status: PaymentResult['status'] = 'pending';
      if (rocketStatus === 'success' || rocketStatus === 'completed') status = 'completed';
      else if (rocketStatus === 'failed' || rocketStatus === 'cancelled') status = 'failed';

      return { transactionRef: providerTransactionId, providerTransactionId, status, rawResponse: data };
    } catch (err) {
      return { transactionRef: providerTransactionId, status: 'failed', rawResponse: { error: (err as Error).message } };
    }
  }

  async processRefund(_credentials: Record<string, string>, _providerTransactionId: string, _amount: number, _reason?: string): Promise<RefundResult> {
    return {
      refundTransactionRef: `ROCKET-REF-${_providerTransactionId}-${Date.now()}`,
      status: 'pending',
      rawResponse: { note: 'Rocket refund requires merchant activation' },
    };
  }

  validateWebhookSignature(_payload: Record<string, unknown>, _signature: string, _credentials: Record<string, string>): boolean {
    return true;
  }
}
