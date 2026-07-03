export interface CreateShipmentInput {
  merchantOrderId: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  district: string;
  area?: string;
  weight?: number;
  codAmount?: number;
  note?: string;
}

export interface ShipmentResult {
  consignmentId: string;
  trackingNo?: string;
  status: string;
  estimatedDelivery?: string;
  labelUrl?: string;
  rawResponse: Record<string, unknown>;
}

export interface CourierProvider {
  readonly providerCode: string;
  readonly displayName: string;
  createShipment(credentials: Record<string, string>, input: CreateShipmentInput): Promise<ShipmentResult>;
  queryShipmentStatus(credentials: Record<string, string>, consignmentId: string): Promise<ShipmentResult>;
  cancelShipment(credentials: Record<string, string>, consignmentId: string): Promise<ShipmentResult>;
  getDeliveryCharge?(credentials: Record<string, string>, district: string, weight: number): Promise<number>;
}
