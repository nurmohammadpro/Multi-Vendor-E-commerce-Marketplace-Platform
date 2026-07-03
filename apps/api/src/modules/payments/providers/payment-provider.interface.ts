export interface InitiatePaymentInput {
  gatewayId: string;
  storeId: string;
  amount: number;
  currency: string;           // default 'BDT'
  orderReference: string;     // sale_no or invoice_no
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  transactionRef: string;           // our internal reference
  providerTransactionId?: string;   // gateway-side transaction ID
  status: 'completed' | 'pending' | 'failed';
  rawResponse: Record<string, unknown>;
  redirectUrl?: string;
}

export interface RefundResult {
  refundTransactionRef: string;
  status: 'completed' | 'pending' | 'failed';
  rawResponse: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly providerCode: string;
  readonly displayName: string;

  initiatePayment(credentials: Record<string, string>, input: InitiatePaymentInput): Promise<PaymentResult>;
  queryPaymentStatus(credentials: Record<string, string>, providerTransactionId: string): Promise<PaymentResult>;
  processRefund(credentials: Record<string, string>, providerTransactionId: string, amount: number, reason?: string): Promise<RefundResult>;
  validateWebhookSignature(payload: Record<string, unknown>, signature: string, credentials: Record<string, string>): boolean;
}
