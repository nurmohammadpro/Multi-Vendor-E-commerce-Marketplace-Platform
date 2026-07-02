'use client';

import { useEffect, useState } from 'react';

import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
  neutralButtonStyle,
  pageShellStyle,
  searchButtonStyle,
  sectionPanelStyle,
  surfaceCardStyle,
  tableActionButtonStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../marketone-theme';
import { stackedFilterGridStyle, useCompactLayout, WorkspaceTabs } from '../workspace-responsive';

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

type Pagination = {
  page: number;
  limit: number;
  total: number;
};

const cardStyle = surfaceCardStyle;
const inputStyle = fieldStyle;

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
  const compact = useCompactLayout();
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const canCreateShipment = Boolean(form.customerName.trim() && form.customerPhone.trim() && form.deliveryAddress.trim() && !loading);
  const [activeTab, setActiveTab] = useState<'create' | 'shipments' | 'timeline'>('shipments');

  const refresh = async (nextPage = 1) => {
    const params = new URLSearchParams({
      page: String(nextPage),
      limit: String(pagination.limit),
    });
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter) params.set('status', statusFilter);
    const [courierPayload, shipmentPayload] = await Promise.all([
      readJson<{ couriers: Courier[] }>('/api/shipping/couriers'),
      readJson<{ shipments: Shipment[]; pagination?: Pagination }>(`/api/shipping/shipments?${params.toString()}`),
    ]);
    setCouriers(courierPayload.couriers ?? []);
    setShipments(shipmentPayload.shipments ?? []);
    setPagination(shipmentPayload.pagination ?? { page: nextPage, limit: pagination.limit, total: shipmentPayload.shipments?.length ?? 0 });
    setPage(shipmentPayload.pagination?.page ?? nextPage);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20)));

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
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      {compact ? (
        <WorkspaceTabs
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'create' | 'shipments' | 'timeline')}
          tabs={[
            { key: 'shipments', label: 'Shipments' },
            { key: 'create', label: 'Create' },
            { key: 'timeline', label: 'Timeline' },
          ]}
        />
      ) : null}
      {(!compact || activeTab === 'create') ? (
      <article style={{ ...cardStyle, ...sectionPanelStyle }}>
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
        <button onClick={createShipment} style={accentButtonStyle} disabled={!canCreateShipment || !canManageShipping}>Create Shipment</button>
      </article>
      ) : null}

      <section style={{ ...sectionPanelStyle, gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {!compact || activeTab === 'shipments' ? (
        <article style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Shipments</h3>
          <div style={{ ...stackedFilterGridStyle, marginBottom: 12 }}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} style={inputStyle} placeholder="Search shipment, customer, phone" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={inputStyle}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="picked_up">Picked up</option>
              <option value="in_transit">In transit</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="returned">Returned</option>
            </select>
            <button onClick={() => void refresh(1)} style={searchButtonStyle} disabled={loading}>Apply</button>
          </div>
          {shipments.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Shipment</th>
                    <th style={tableHeaderCellStyle}>Customer</th>
                    <th style={tableHeaderCellStyle}>Courier</th>
                    <th style={tableHeaderCellStyle}>Fee</th>
                    <th style={tableHeaderCellStyle}>Status</th>
                    <th style={tableHeaderCellStyle}>Created</th>
                    <th style={tableHeaderCellStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => (
                    <tr key={shipment.id}>
                      <td style={tableCellStyle}>
                        <button onClick={() => void loadShipment(shipment.id)} style={tableActionButtonStyle}>{shipment.shipment_no}</button>
                      </td>
                      <td style={tableCellStyle}>
                        {shipment.customer_name}
                        <div style={{ color: '#64748b', marginTop: 4 }}>{shipment.customer_phone}</div>
                      </td>
                      <td style={tableCellStyle}>{shipment.courier_name || 'No courier'}</td>
                      <td style={tableCellStyle}>{shipment.delivery_fee}</td>
                      <td style={tableCellStyle}>{shipment.status}</td>
                      <td style={tableCellStyle}>{new Date(shipment.created_at).toLocaleString()}</td>
                      <td style={tableCellStyle}>
                        {canManageShipping ? (
                          <select
                            value={shipment.status}
                            onChange={(event) => void updateStatus(shipment.id, event.target.value)}
                            style={inputStyle}
                            disabled={loading}
                          >
                            {['assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned'].map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={emptyStateStyle}>No shipments are in the queue yet.</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12 }}>
            <span style={tokenMutedStyle}>Page {page} of {totalPages} · {pagination.total} shipment(s)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => void refresh(Math.max(1, page - 1))} style={neutralButtonStyle} disabled={loading || page <= 1}>Previous</button>
              <button onClick={() => void refresh(Math.min(totalPages, page + 1))} style={neutralButtonStyle} disabled={loading || page >= totalPages}>Next</button>
            </div>
          </div>
        </article>
        ) : null}

        {!compact || activeTab === 'timeline' ? (
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
              {selectedShipment.events.length ? (
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCellStyle}>Event</th>
                        <th style={tableHeaderCellStyle}>Note</th>
                        <th style={tableHeaderCellStyle}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedShipment.events.map((event) => (
                        <tr key={event.id}>
                          <td style={tableCellStyle}>{event.event_type}</td>
                          <td style={tableCellStyle}>{event.note}</td>
                          <td style={tableCellStyle}>{new Date(event.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={emptyStateStyle}>No timeline events recorded yet.</div>
              )}
            </section>
          )}
        </article>
        ) : null}
      </section>

      <article style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={{ marginBottom: 0, color: '#475569' }}>{message}</p>
      </article>
    </section>
  );
}
