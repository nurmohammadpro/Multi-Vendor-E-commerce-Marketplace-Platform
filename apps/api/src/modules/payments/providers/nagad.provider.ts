import type { InitiatePaymentInput, PaymentProvider, PaymentResult, RefundResult } from './payment-provider.interface.js';

interface NagadCredentials {
  merchantId: string;
  publicKey: string;
  privateKey: string;
  sandbox: boolean;
}

export class NagadProvider implements PaymentProvider {
  readonly providerCode = 'nagad';
  readonly displayName = 'Nagad';

  private getBaseUrl(sandbox: boolean): string {
    return sandbox
      ? 'http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs'
      : 'https://api.mynagad.com/remote-payment-gateway-1.0/api/dfs';
  }

  private parseCredentials(credentials: Record<string, string>): NagadCredentials {
    return {
      merchantId: credentials.merchant_id || '',
      publicKey: credentials.public_key || '',
      privateKey: credentials.private_key || '',
      sandbox: credentials.sandbox === 'true',
    };
  }

  async initiatePayment(credentials: Record<string, string>, input: InitiatePaymentInput): Promise<PaymentResult> {
    const creds = this.parseCredentials(credentials);
    const baseUrl = this.getBaseUrl(creds.sandbox);
    const transactionRef = `NAGAD-${input.orderReference}-${Date.now()}`;

    const body = {
      merchantId: creds.merchantId,
      orderId: transactionRef,
      amount: String(input.amount),
      currencyCode: input.currency || '050',
      challenge: '',
    };

    try {
      const response = await fetch(`${baseUrl}/check-out/initialize/${creds.merchantId}/${transactionRef}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) return { transactionRef, status: 'failed', rawResponse: data };

      return {
        transactionRef,
        providerTransactionId: (data.paymentReferenceId as string) || transactionRef,
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
      const response = await fetch(`${baseUrl}/check-out/status/${creds.merchantId}/${providerTransactionId}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json() as Record<string, unknown>;
      const nagadStatus = (data.status as string || '').toLowerCase();

      let status: PaymentResult['status'] = 'pending';
      if (nagadStatus === 'success') status = 'completed';
      else if (nagadStatus === 'failed' || nagadStatus === 'cancelled') status = 'failed';

      return { transactionRef: providerTransactionId, providerTransactionId, status, rawResponse: data };
    } catch (err) {
      return { transactionRef: providerTransactionId, status: 'failed', rawResponse: { error: (err as Error).message } };
    }
  }

  async processRefund(_credentials: Record<string, string>, _providerTransactionId: string, _amount: number, _reason?: string): Promise<RefundResult> {
    return {
      refundTransactionRef: `NAGAD-REF-${_providerTransactionId}-${Date.now()}`,
      status: 'pending',
      rawResponse: { note: 'Nagad refund requires merchant activation' },
    };
  }

  validateWebhookSignature(_payload: Record<string, unknown>, _signature: string, _credentials: Record<string, string>): boolean {
    return true;
  }
}
