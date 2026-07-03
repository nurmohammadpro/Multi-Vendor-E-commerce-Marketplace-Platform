import type { InitiatePaymentInput, PaymentProvider, PaymentResult, RefundResult } from './payment-provider.interface.js';

interface SslcommerzCredentials {
  storeId: string;
  storePassword: string;
  sandbox: boolean;
}

export class SslcommerzProvider implements PaymentProvider {
  readonly providerCode = 'sslcommerz';
  readonly displayName = 'SSLCommerz';

  private getBaseUrl(sandbox: boolean): string {
    return sandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';
  }

  private parseCredentials(credentials: Record<string, string>): SslcommerzCredentials {
    return {
      storeId: credentials.store_id || '',
      storePassword: credentials.store_password || '',
      sandbox: credentials.sandbox === 'true',
    };
  }

  async initiatePayment(credentials: Record<string, string>, input: InitiatePaymentInput): Promise<PaymentResult> {
    const creds = this.parseCredentials(credentials);
    const baseUrl = this.getBaseUrl(creds.sandbox);
    const transactionRef = `SSL-${input.orderReference}-${Date.now()}`;
    const apiBase = process.env.API_BASE_URL || 'http://localhost:4000/v1';

    const body: Record<string, string> = {
      store_id: creds.storeId,
      store_passwd: creds.storePassword,
      total_amount: String(input.amount),
      currency: input.currency || 'BDT',
      tran_id: transactionRef,
      success_url: `${apiBase}/webhooks/payments/sslcommerz?status=success`,
      fail_url: `${apiBase}/webhooks/payments/sslcommerz?status=fail`,
      cancel_url: `${apiBase}/webhooks/payments/sslcommerz?status=cancel`,
      ipn_url: `${apiBase}/webhooks/payments/sslcommerz`,
      cus_name: input.customerName || 'Customer',
      cus_phone: input.customerPhone || '',
      cus_email: input.customerEmail || 'customer@example.com',
      product_name: `Order ${input.orderReference}`,
      product_category: 'General',
      product_profile: 'general',
      shipping_method: 'NO',
    };

    const response = await fetch(`${baseUrl}/gwprocess/v4/api.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });

    const data = await response.json() as Record<string, unknown>;

    if (data.status === 'SUCCESS') {
      return {
        transactionRef,
        providerTransactionId: (data.sessionkey as string) || (data.tran_id as string),
        status: 'pending',
        rawResponse: data,
        redirectUrl: data.GatewayPageURL as string,
      };
    }

    return { transactionRef, status: 'failed', rawResponse: data };
  }

  async queryPaymentStatus(credentials: Record<string, string>, providerTransactionId: string): Promise<PaymentResult> {
    const creds = this.parseCredentials(credentials);
    const baseUrl = this.getBaseUrl(creds.sandbox);

    const params = new URLSearchParams({
      store_id: creds.storeId,
      store_passwd: creds.storePassword,
      format: 'json',
      tran_id: providerTransactionId,
    });

    const response = await fetch(`${baseUrl}/validator/api/validationserverAPI.php?${params.toString()}`);
    const data = await response.json() as Record<string, unknown>;

    let status: PaymentResult['status'] = 'pending';
    if (data.status === 'VALID' || data.status === 'VALIDATED') status = 'completed';
    else if (data.status === 'FAILED' || data.status === 'CANCELLED') status = 'failed';

    return {
      transactionRef: providerTransactionId,
      providerTransactionId: (data.tran_id as string) || providerTransactionId,
      status,
      rawResponse: data,
    };
  }

  async processRefund(credentials: Record<string, string>, providerTransactionId: string, amount: number, reason?: string): Promise<RefundResult> {
    const creds = this.parseCredentials(credentials);
    const baseUrl = this.getBaseUrl(creds.sandbox);
    const refundRef = `SSL-REF-${providerTransactionId}-${Date.now()}`;

    const body = new URLSearchParams({
      store_id: creds.storeId,
      store_passwd: creds.storePassword,
      refund_amount: String(amount),
      refund_remarks: reason || 'Customer refund',
      bank_tran_id: providerTransactionId,
      refe_id: refundRef,
      format: 'json',
    });

    const response = await fetch(`${baseUrl}/validator/api/merchantTransIDvalidationAPI.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await response.json() as Record<string, unknown>;

    return {
      refundTransactionRef: refundRef,
      status: response.ok ? 'completed' : 'failed',
      rawResponse: data,
    };
  }

  validateWebhookSignature(payload: Record<string, unknown>, _signature: string, credentials: Record<string, string>): boolean {
    const creds = this.parseCredentials(credentials);
    return (payload.store_id as string) === creds.storeId;
  }
}
