import type { CourierProvider, CreateShipmentInput, ShipmentResult } from './courier-provider.interface.js';

export class SteadfastProvider implements CourierProvider {
  readonly providerCode = 'steadfast';
  readonly displayName = 'Steadfast Courier';

  private getBaseUrl(sandbox: boolean): string {
    return sandbox ? 'https://sandbox.steadfast.com.bd' : 'https://portal.steadfast.com.bd';
  }

  private parseCredentials(c: Record<string, string>) {
    return { apiKey: c.api_key || '', secretKey: c.secret_key || '', sandbox: c.sandbox === 'true' };
  }

  async createShipment(credentials: Record<string, string>, input: CreateShipmentInput): Promise<ShipmentResult> {
    const creds = this.parseCredentials(credentials);
    try {
      const response = await fetch(`${this.getBaseUrl(creds.sandbox)}/api/v1/create_order`, {
        method: 'POST',
        headers: { 'Api-Key': creds.apiKey, 'Secret-Key': creds.secretKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice: input.merchantOrderId,
          recipient_name: input.recipientName,
          recipient_phone: input.recipientPhone,
          recipient_address: input.address,
          cod_amount: input.codAmount || 0,
          note: input.note,
        }),
      });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) return { consignmentId: '', status: 'failed', rawResponse: data };
      return {
        consignmentId: (data.consignment_id as string) || '',
        trackingNo: (data.tracking_code as string),
        status: data.status as string || 'pending',
        labelUrl: data.label_url as string,
        rawResponse: data,
      };
    } catch (err) {
      return { consignmentId: '', status: 'failed', rawResponse: { error: (err as Error).message } };
    }
  }

  async queryShipmentStatus(credentials: Record<string, string>, consignmentId: string): Promise<ShipmentResult> {
    const creds = this.parseCredentials(credentials);
    try {
      const response = await fetch(`${this.getBaseUrl(creds.sandbox)}/api/v1/status_by_cid/${consignmentId}`, {
        headers: { 'Api-Key': creds.apiKey, 'Secret-Key': creds.secretKey },
      });
      const data = await response.json() as Record<string, unknown>;
      return {
        consignmentId,
        trackingNo: data.tracking_code as string,
        status: (data.status as string) || 'unknown',
        rawResponse: data,
      };
    } catch (err) {
      return { consignmentId, status: 'unknown', rawResponse: { error: (err as Error).message } };
    }
  }

  async cancelShipment(credentials: Record<string, string>, consignmentId: string): Promise<ShipmentResult> {
    const creds = this.parseCredentials(credentials);
    try {
      const response = await fetch(`${this.getBaseUrl(creds.sandbox)}/api/v1/cancel_order/${consignmentId}`, {
        method: 'POST',
        headers: { 'Api-Key': creds.apiKey, 'Secret-Key': creds.secretKey, 'Content-Type': 'application/json' },
      });
      const data = await response.json() as Record<string, unknown>;
      return { consignmentId, status: response.ok ? 'cancelled' : 'failed', rawResponse: data };
    } catch (err) {
      return { consignmentId, status: 'failed', rawResponse: { error: (err as Error).message } };
    }
  }
}
