'use client';

import { useEffect, useState } from 'react';

import { emptyStateStyle, fieldStyle, secondaryButtonStyle, surfaceCardStyle, tokenMutedStyle } from '../motocore-theme';

type Courier = {
  id: string;
  code: string;
  name: string;
  status: string;
};

type Shipment = {
  id: string;
  shipment_no: string;
  sale_id?: string | null;
  customer_name: string;
  customer_phone: string;
  delivery_fee: string | number;
  tracking_no?: string | null;
  status: string;
  courier_name?: string | null;
  created_at: string;
};

type ShipmentDetail = {
  shipment: Shipment & {
    delivery_address: string;
    district?: string | null;
    area?: string | null;
  };
  events: Array<{
    id: string;
    event_type: string;
    note: string;
    created_at: string;
  }>;
};

const cardStyle = surfaceCardStyle;
const inputStyle = fieldStyle;
const buttonStyle = secondaryButtonStyle;

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function ShippingWorkspace({
  canManageShipping,
  canViewShipping,
}: {
  canManageShipping: boolean;
  canViewShipping: boolean;
}) {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentDetail | null>(null);
  const [message, setMessage] = useState('Shipping operations are ready.');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    saleId: '',
    courierProviderId: '',
    customerName: '',
    customerPhone: '',
    deliveryAddress: '',
    district: '',
    area: '',
    deliveryFee: '',
    trackingNo: '',
    note: '',
  });
  const canCreateShipment = Boolean(form.customerName.trim() && form.customerPhone.trim() && form.deliveryAddress.trim() && !loading);

  const refresh = async () => {
    const [courierPayload, shipmentPayload] = await Promise.all([
      readJson<{ couriers: Courier[] }>('/api/shipping/couriers'),
      readJson<{ shipments: Shipment[] }>('/api/shipping/shipments'),
    ]);
    setCouriers(courierPayload.couriers ?? []);
    setShipments(shipmentPayload.shipments ?? []);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const loadShipment = async (shipmentId: string) => {
    try {
      const payload = await readJson<ShipmentDetail>(`/api/shipping/shipments/${shipmentId}`);
      setSelectedShipment(payload);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const createShipment = async () => {
    if (!form.customerName || !form.customerPhone || !form.deliveryAddress) {
      setMessage('Customer name, phone, and address are required.');
      return;
    }
    setLoading(true);
    try {
      await readJson('/api/shipping/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: form.saleId || undefined,
          courierProviderId: form.courierProviderId || undefined,
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          deliveryAddress: form.deliveryAddress,
          district: form.district || undefined,
          area: form.area || undefined,
          deliveryFee: Number(form.deliveryFee || 0),
          trackingNo: form.trackingNo || undefined,
          note: form.note || undefined,
        }),
      });
      await refresh();
      setForm({
        saleId: '',
        courierProviderId: '',
        customerName: '',
        customerPhone: '',
        deliveryAddress: '',
        district: '',
        area: '',
        deliveryFee: '',
        trackingNo: '',
        note: '',
      });
      setMessage('Shipment created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (shipmentId: string, status: string) => {
    setLoading(true);
    try {
      await readJson(`/api/shipping/shipments/${shipmentId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          note: `Updated to ${status}`,
        }),
      });
      await refresh();
      await loadShipment(shipmentId);
      setMessage(`Shipment moved to ${status}.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!canViewShipping) {
    return (
      <section style={{ display: 'grid', gap: 16 }}>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Shipping access limited</h3>
          <p style={tokenMutedStyle}>Your role can’t view shipment timelines or courier operations.</p>
        </article>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <article style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Create Shipment</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <input value={form.saleId} onChange={(e) => setForm((v) => ({ ...v, saleId: e.target.value }))} style={inputStyle} placeholder="Sale ID (optional)" />
          <select value={form.courierProviderId} onChange={(e) => setForm((v) => ({ ...v, courierProviderId: e.target.value }))} style={inputStyle}>
            <option value="">No courier yet</option>
            {couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.name}</option>)}
          </select>
          <input value={form.deliveryFee} onChange={(e) => setForm((v) => ({ ...v, deliveryFee: e.target.value }))} style={inputStyle} placeholder="Delivery fee" />
          <input value={form.customerName} onChange={(e) => setForm((v) => ({ ...v, customerName: e.target.value }))} style={inputStyle} placeholder="Customer name" />
          <input value={form.customerPhone} onChange={(e) => setForm((v) => ({ ...v, customerPhone: e.target.value }))} style={inputStyle} placeholder="Customer phone" />
          <input value={form.trackingNo} onChange={(e) => setForm((v) => ({ ...v, trackingNo: e.target.value }))} style={inputStyle} placeholder="Tracking no" />
          <input value={form.district} onChange={(e) => setForm((v) => ({ ...v, district: e.target.value }))} style={inputStyle} placeholder="District" />
          <input value={form.area} onChange={(e) => setForm((v) => ({ ...v, area: e.target.value }))} style={inputStyle} placeholder="Area" />
          <input value={form.note} onChange={(e) => setForm((v) => ({ ...v, note: e.target.value }))} style={inputStyle} placeholder="Note" />
        </div>
        <textarea value={form.deliveryAddress} onChange={(e) => setForm((v) => ({ ...v, deliveryAddress: e.target.value }))} style={{ ...inputStyle, minHeight: 90, marginTop: 10, marginBottom: 10 }} placeholder="Delivery address" />
        <button onClick={createShipment} style={buttonStyle} disabled={!canCreateShipment || !canManageShipping}>Create Shipment</button>
      </article>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Shipments</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {shipments.length ? (
              shipments.map((shipment) => (
                <article key={shipment.id} style={{ ...cardStyle, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div onClick={() => loadShipment(shipment.id)} style={{ cursor: 'pointer' }}>
                      <div style={{ fontWeight: 600 }}>{shipment.shipment_no}</div>
                      <div style={{ color: '#475569' }}>
                        {shipment.customer_name} · {shipment.customer_phone}
                      </div>
                      <div style={{ color: '#64748b' }}>
                        {shipment.status} · {shipment.courier_name || 'No courier'} · Fee: {shipment.delivery_fee}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {canManageShipping
                        ? ['assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned'].map((status) => (
                          <button key={status} onClick={() => updateStatus(shipment.id, status)} style={buttonStyle} disabled={loading || shipment.status === status}>
                            {status}
                          </button>
                        ))
                        : null}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div style={emptyStateStyle}>No shipments are in the queue yet.</div>
            )}
          </div>
        </article>

        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Shipment Timeline</h3>
          {!selectedShipment ? (
            <div style={emptyStateStyle}>Select a shipment to inspect its timeline.</div>
          ) : (
            <section style={{ display: 'grid', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{selectedShipment.shipment.shipment_no}</div>
                <div style={{ color: '#475569' }}>{selectedShipment.shipment.customer_name} · {selectedShipment.shipment.status}</div>
                <div style={{ color: '#64748b' }}>{selectedShipment.shipment.delivery_address}</div>
              </div>
              {selectedShipment.events.map((event) => (
                <article key={event.id} style={{ ...cardStyle, padding: 14 }}>
                  <div style={{ fontWeight: 600 }}>{event.event_type}</div>
                  <div style={{ color: '#64748b' }}>{event.note}</div>
                  <div style={{ color: '#94a3b8' }}>{new Date(event.created_at).toLocaleString()}</div>
                </article>
              ))}
            </section>
          )}
        </article>
      </section>

      <article style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={{ marginBottom: 0, color: '#475569' }}>{message}</p>
      </article>
    </section>
  );
}
