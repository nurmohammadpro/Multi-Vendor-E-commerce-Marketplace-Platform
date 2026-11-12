import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';

const mockPool = { query: vi.fn(), connect: vi.fn() };
const mockAudit = { recordUserAction: vi.fn(), recordStoreAction: vi.fn() };
const mockBilling = { hasStoreFeature: vi.fn() };

vi.mock('pg', () => ({ default: { Pool: vi.fn(() => mockPool) } }));
vi.mock('../../../src/modules/database/database.constants.js', () => ({ DATABASE_POOL: 'DATABASE_POOL' }));
vi.mock('../../../src/modules/audit/audit.service.js', () => ({ AuditService: vi.fn(() => mockAudit) }));
vi.mock('../../../src/modules/billing/billing.service.js', () => ({ BillingService: vi.fn(() => mockBilling) }));

const storeAuth = { type: 'store', storeId: 'store-1' } as any;

const SALE_ROW = {
  id: 'sale-1',
  store_id: 'store-1',
  sale_no: 'SALE-000001',
  invoice_no: null,
  sale_date: null,
  total_amount: '1500.00',
  subtotal_amount: '1500.00',
  discount_amount: '0',
  vat_amount: '0',
  tax_amount: '0',
  shipping_amount: '0',
  payment_status: 'due',
  status: 'completed',
  due_date: '2026-12-01',
  note: null,
  customer_name: 'Wholesale Buyer',
  customer_phone: '01700000000',
  customer_email: null,
  customer_shop_name: 'Buyer Shop',
  customer_address: null,
  exchange_sku_id: null,
  exchange_amount: null,
  sold_by: null,
  created_at: new Date('2026-11-12T10:00:00Z'),
};

let PosService: any;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../../../src/modules/pos/pos.service.js');
  PosService = mod.PosService;
});

function routeQueries(handler: (sql: string, params: any[]) => any) {
  mockPool.query.mockImplementation(async (sql: string, params: any[]) => handler(sql, params));
}

function stubSaleQueries(options: { payments?: any[]; items?: any[] } = {}) {
  routeQueries((sql) => {
    if (sql.includes('select p.features_json')) return { rows: [{ features_json: ['invoices'] }] };
    if (sql.includes('update sales.sales')) return { rows: [] };
    if (sql.includes('select *') && sql.includes('from sales.sales')) return { rows: [SALE_ROW] };
    if (sql.includes('from sales.sale_items')) return { rows: options.items ?? [] };
    if (sql.includes('select id, payment_method')) return { rows: options.payments ?? [] };
    if (sql.includes('from store.stores s')) {
      return { rows: [{ name: 'Wholesale Store', logo_url: null, phone: '01800000000', email: null, address_text: 'Dhaka', receipt_footer: null }] };
    }
    return { rows: [] };
  });
}

describe('PosService.getSaleInvoice', () => {
  it('should reject when the store plan lacks the invoices feature', async () => {
    mockBilling.hasStoreFeature.mockResolvedValue(false);
    const svc = new PosService(mockPool, mockAudit, mockBilling);
    await expect(svc.getSaleInvoice('sale-1', 'store-1', storeAuth)).rejects.toThrow(ForbiddenException);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('should generate a compact invoice number with the default prefix', async () => {
    mockBilling.hasStoreFeature.mockResolvedValue(true);
    routeQueries((sql) => {
      if (sql.includes('select p.features_json')) return { rows: [{ features_json: ['invoices'] }] };
      if (sql.includes('select invoice_no from sales.sales')) return { rows: [{ invoice_no: null }] };
      if (sql.includes('select invoice_prefix from store.store_settings')) return { rows: [{ invoice_prefix: null }] };
      if (sql.includes('invoice_no is not null')) return { rows: [{ count: '41' }] };
      if (sql.includes('update sales.sales')) return { rows: [{ invoice_no: 'INV-0042' }] };
      if (sql.includes('select *') && sql.includes('from sales.sales')) return { rows: [{ ...SALE_ROW, invoice_no: 'INV-0042' }] };
      if (sql.includes('from sales.sale_items')) return { rows: [] };
      if (sql.includes('select id, payment_method')) return { rows: [{ payment_method: 'cod', status: 'pending', amount: '1500.00' }] };
      if (sql.includes('from store.stores s')) {
        return { rows: [{ name: 'Wholesale Store', logo_url: null, phone: null, email: null, address_text: null, receipt_footer: null }] };
      }
      return { rows: [] };
    });

    const svc = new PosService(mockPool, mockAudit, mockBilling);
    const result = await svc.getSaleInvoice('sale-1', 'store-1', storeAuth);

    expect(result.sale.invoiceNo).toBe('INV-0042');
    const updateCall = mockPool.query.mock.calls.find(([sql]: any[]) => String(sql).includes('update sales.sales'));
    expect(updateCall[1][2]).toBe('INV-0042');
  });

  it('should use the store invoice prefix, uppercased and trimmed', async () => {
    mockBilling.hasStoreFeature.mockResolvedValue(true);
    routeQueries((sql) => {
      if (sql.includes('select p.features_json')) return { rows: [{ features_json: ['invoices'] }] };
      if (sql.includes('select invoice_no from sales.sales')) return { rows: [{ invoice_no: null }] };
      if (sql.includes('select invoice_prefix from store.store_settings')) return { rows: [{ invoice_prefix: ' ws ' }] };
      if (sql.includes('invoice_no is not null')) return { rows: [{ count: '3' }] };
      if (sql.includes('update sales.sales')) return { rows: [{ invoice_no: 'WS-0004' }] };
      if (sql.includes('select *') && sql.includes('from sales.sales')) return { rows: [{ ...SALE_ROW, invoice_no: 'WS-0004' }] };
      if (sql.includes('from sales.sale_items')) return { rows: [] };
      if (sql.includes('select id, payment_method')) return { rows: [] };
      if (sql.includes('from store.stores s')) {
        return { rows: [{ name: 'Wholesale Store', logo_url: null, phone: null, email: null, address_text: null, receipt_footer: null }] };
      }
      return { rows: [] };
    });

    const svc = new PosService(mockPool, mockAudit, mockBilling);
    const result = await svc.getSaleInvoice('sale-1', 'store-1', storeAuth);
    expect(result.sale.invoiceNo).toBe('WS-0004');
  });

  it('should return the existing invoice number without reassigning', async () => {
    mockBilling.hasStoreFeature.mockResolvedValue(true);
    stubSaleQueries();
    routeQueries((sql) => {
      if (sql.includes('select p.features_json')) return { rows: [{ features_json: ['invoices'] }] };
      if (sql.includes('select invoice_no from sales.sales')) return { rows: [{ invoice_no: 'INV-0007' }] };
      if (sql.includes('select *') && sql.includes('from sales.sales')) return { rows: [{ ...SALE_ROW, invoice_no: 'INV-0007' }] };
      if (sql.includes('from sales.sale_items')) return { rows: [] };
      if (sql.includes('select id, payment_method')) return { rows: [] };
      if (sql.includes('from store.stores s')) {
        return { rows: [{ name: 'Wholesale Store', logo_url: null, phone: null, email: null, address_text: null, receipt_footer: null }] };
      }
      return { rows: [] };
    });

    const svc = new PosService(mockPool, mockAudit, mockBilling);
    const result = await svc.getSaleInvoice('sale-1', 'store-1', storeAuth);
    expect(result.sale.invoiceNo).toBe('INV-0007');
    expect(mockPool.query.mock.calls.some(([sql]: any[]) => String(sql).includes('update sales.sales'))).toBe(false);
  });

  it('should retry with the next sequence number when the update hits the unique index', async () => {
    mockBilling.hasStoreFeature.mockResolvedValue(true);
    let updateAttempts = 0;
    routeQueries((sql) => {
      if (sql.includes('select p.features_json')) return { rows: [{ features_json: ['invoices'] }] };
      if (sql.includes('select invoice_no from sales.sales')) return { rows: [{ invoice_no: null }] };
      if (sql.includes('select invoice_prefix from store.store_settings')) return { rows: [{ invoice_prefix: null }] };
      if (sql.includes('invoice_no is not null')) return { rows: [{ count: '41' }] };
      if (sql.includes('update sales.sales')) {
        updateAttempts += 1;
        // First attempt loses the unique-index race; the retry wins.
        return updateAttempts === 1 ? { rows: [] } : { rows: [{ invoice_no: 'INV-0043' }] };
      }
      if (sql.includes('select *') && sql.includes('from sales.sales')) return { rows: [{ ...SALE_ROW, invoice_no: 'INV-0043' }] };
      if (sql.includes('from sales.sale_items')) return { rows: [] };
      if (sql.includes('select id, payment_method')) return { rows: [] };
      if (sql.includes('from store.stores s')) {
        return { rows: [{ name: 'Wholesale Store', logo_url: null, phone: null, email: null, address_text: null, receipt_footer: null }] };
      }
      return { rows: [] };
    });

    const svc = new PosService(mockPool, mockAudit, mockBilling);
    const result = await svc.getSaleInvoice('sale-1', 'store-1', storeAuth);
    expect(result.sale.invoiceNo).toBe('INV-0043');
    expect(updateAttempts).toBe(2);
  });

  it('should report cod payment terms when a cod payment exists on the sale', async () => {
    mockBilling.hasStoreFeature.mockResolvedValue(true);
    routeQueries((sql) => {
      if (sql.includes('select p.features_json')) return { rows: [{ features_json: ['invoices'] }] };
      if (sql.includes('select invoice_no from sales.sales')) return { rows: [{ invoice_no: 'INV-0009' }] };
      if (sql.includes('select *') && sql.includes('from sales.sales')) return { rows: [{ ...SALE_ROW, invoice_no: 'INV-0009' }] };
      if (sql.includes('from sales.sale_items')) return { rows: [] };
      if (sql.includes('select id, payment_method')) {
        return { rows: [{ payment_method: 'cod', status: 'pending', amount: '1500.00' }] };
      }
      if (sql.includes('from store.stores s')) {
        return { rows: [{ name: 'Wholesale Store', logo_url: null, phone: null, email: null, address_text: null, receipt_footer: null }] };
      }
      return { rows: [] };
    });

    const svc = new PosService(mockPool, mockAudit, mockBilling);
    const result = await svc.getSaleInvoice('sale-1', 'store-1', storeAuth);
    expect(result.receipt.paymentTerms).toBe('cod');
    expect(result.receipt.totals.due).toBe(1500);
  });

  it('should report paid terms when the sale is fully paid', async () => {
    mockBilling.hasStoreFeature.mockResolvedValue(true);
    routeQueries((sql) => {
      if (sql.includes('select p.features_json')) return { rows: [{ features_json: ['invoices'] }] };
      if (sql.includes('select invoice_no from sales.sales')) return { rows: [{ invoice_no: 'INV-0010' }] };
      if (sql.includes('select *') && sql.includes('from sales.sales')) {
        return { rows: [{ ...SALE_ROW, invoice_no: 'INV-0010', payment_status: 'paid' }] };
      }
      if (sql.includes('from sales.sale_items')) return { rows: [] };
      if (sql.includes('select id, payment_method')) {
        return { rows: [{ payment_method: 'cash', status: 'paid', amount: '1500.00' }] };
      }
      if (sql.includes('from store.stores s')) {
        return { rows: [{ name: 'Wholesale Store', logo_url: null, phone: null, email: null, address_text: null, receipt_footer: null }] };
      }
      return { rows: [] };
    });

    const svc = new PosService(mockPool, mockAudit, mockBilling);
    const result = await svc.getSaleInvoice('sale-1', 'store-1', storeAuth);
    expect(result.receipt.paymentTerms).toBe('paid');
    expect(result.receipt.totals.due).toBe(0);
  });
});
