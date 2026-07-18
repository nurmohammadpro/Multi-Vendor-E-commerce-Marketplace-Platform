import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool = {
  query: vi.fn(),
  connect: vi.fn(),
};

vi.mock('pg', () => ({ default: { Pool: vi.fn(() => mockPool) } }));
vi.mock('../../../src/modules/database/database.constants.js', () => ({ DATABASE_POOL: 'DATABASE_POOL' }));

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const STORE_ID = 'store-0000-0000-0000-000000000001';
const TENANT_ID = 'tenant-0000-0000-0000-000000000001';
const USER_ID = 'user-0000-0000-0000-000000000001';
const LOCATION_ID = 'loc-0000-0000-0000-000000000001';
const SUPPLIER_ID = 'supplier-0000-0000-0000-000000000001';
const PRODUCT_ID = 'product-0000-0000-0000-000000000001';
const SKU_ID = 'sku-0000-0000-0000-000000000001';
const PURCHASE_ID = 'purchase-0000-0000-0000-000000000001';

const AUTH_CONTEXT = { type: 'store' as const, storeId: STORE_ID, roles: ['store_owner'] };
const SESSION = { user: { id: USER_ID, tenantId: TENANT_ID } } as any;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makePayload(overrides: Record<string, any> = {}) {
  return {
    productName: 'Test Product',
    supplierId: SUPPLIER_ID,
    locationId: LOCATION_ID,
    salePrice: 150,
    purchaseQty: 10,
    unitCost: 100,
    paidAmount: 0,
    paymentMethod: 'cash',
    hasVariants: false,
    ...overrides,
  };
}

/**
 * Set up mockClient.query to handle the full quickReceive transaction flow.
 * Dispatches based on SQL content rather than call order, making it resilient
 * to minor query reordering.
 */
function setupClientForInserts() {
  mockClient.query.mockImplementation(async (...args: any[]) => {
    const sql = typeof args[0] === 'string' ? args[0] : '';

    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
      return { rows: [] };
    }

    // tenant lookup
    if (sql.includes('select tenant_id') && sql.includes('store_code')) {
      return { rows: [{ tenant_id: TENANT_ID, store_code: 'STORE2' }] };
    }
    // insert product
    if (sql.includes('insert into catalog.products') && sql.includes('returning id')) {
      return { rows: [{ id: PRODUCT_ID }] };
    }
    // insert SKU
    if (sql.includes('insert into catalog.skus') && sql.includes('returning id')) {
      return { rows: [{ id: SKU_ID }] };
    }
    // insert price
    if (sql.includes('insert into catalog.prices')) {
      return { rows: [] };
    }
    // insert purchase
    if (sql.includes('insert into procurement.purchases') && sql.includes('returning id')) {
      return { rows: [{ id: PURCHASE_ID }] };
    }
    // purchase items
    if (sql.includes('insert into procurement.purchase_items')) {
      return { rows: [] };
    }
    // inventory balance
    if (sql.includes('insert into inventory.balances')) {
      return { rows: [] };
    }
    // ledger
    if (sql.includes('insert into inventory.ledger')) {
      return { rows: [] };
    }
    // purchase payments
    if (sql.includes('insert into procurement.purchase_payments')) {
      return { rows: [] };
    }

    return { rows: [] };
  });
}

/**
 * Set up pool.query for the standard generatePurchaseNumber flow:
 * store_code → count → uniqueness check.
 * Then wire up the transaction client.
 */
function setupHappyPath() {
  mockPool.connect.mockResolvedValue(mockClient);
  mockPool.query
    .mockResolvedValueOnce({ rows: [{ store_code: 'STORE2' }] })
    .mockResolvedValueOnce({ rows: [{ total: '0' }] })
    .mockResolvedValueOnce({ rows: [] });

  setupClientForInserts();
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

let StoreOpsService: any;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../../../src/modules/store-ops/store-ops.service.js');
  StoreOpsService = mod.StoreOpsService;
});

describe('StoreOpsService', () => {
  describe('quickReceive', () => {
    // ---------------------------------------------------------------
    // Purchase number generation
    // ---------------------------------------------------------------

    describe('purchase number generation', () => {
      it('should call generatePurchaseNumber with the store ID and today\'s date', async () => {
        setupHappyPath();
        const svc = new StoreOpsService(mockPool);
        await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload());

        // pool.query is called 3 times for generatePurchaseNumber:
        // 1. store_code lookup, 2. count, 3. uniqueness check
        expect(mockPool.query).toHaveBeenCalledTimes(3);

        const firstCall = mockPool.query.mock.calls[0];
        expect(firstCall[0]).toContain('select store_code');
        expect(firstCall[1]).toContain(STORE_ID);

        const secondCall = mockPool.query.mock.calls[1];
        expect(secondCall[0]).toContain('select count(*)');
        expect(secondCall[1]).toContain(STORE_ID);
      });

      it('should produce a purchase number in format PUR-{PREFIX}-{YYYYMM}-{NNN}', async () => {
        setupHappyPath();
        const svc = new StoreOpsService(mockPool);
        const result = await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload());

        expect(result.purchase.purchaseNo).toMatch(/^PUR-STORE2-\d{6}-\d{3}$/);
      });

      it('should sanitize store codes with special characters', async () => {
        mockPool.connect.mockResolvedValue(mockClient);
        mockPool.query
          .mockResolvedValueOnce({ rows: [{ store_code: 'MY-STORE!' }] })
          .mockResolvedValueOnce({ rows: [{ total: '0' }] })
          .mockResolvedValueOnce({ rows: [] });

        setupClientForInserts();
        const svc = new StoreOpsService(mockPool);
        const result = await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload());

        // Special chars removed, uppercase, sliced to 6 chars → 'MYSTOR'
        expect(result.purchase.purchaseNo).toMatch(/^PUR-MYSTOR-\d{6}-\d{3}$/);
      });

      it('should increment sequence when first candidate already exists', async () => {
        mockPool.connect.mockResolvedValue(mockClient);
        let uniquenessCalls = 0;
        mockPool.query.mockImplementation(async (...args: any[]) => {
          const sql = typeof args[0] === 'string' ? args[0] : '';
          if (sql.includes('select store_code')) return { rows: [{ store_code: 'STORE2' }] };
          if (sql.includes('select count(*)')) return { rows: [{ total: '0' }] };
          // First two uniqueness checks return an existing purchase
          if (sql.includes('select id') && sql.includes('purchase_no')) {
            uniquenessCalls++;
            return uniquenessCalls <= 2 ? { rows: [{ id: 'existing-id' }] } : { rows: [] };
          }
          return { rows: [] };
        });

        setupClientForInserts();
        const svc = new StoreOpsService(mockPool);
        const result = await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload());

        // With 2 collisions, the 3rd candidate is used (seq = 3)
        expect(result.purchase.purchaseNo).toMatch(/-003$/);
      });

      it('should use timestamp fallback after 5 failed uniqueness attempts', async () => {
        mockPool.connect.mockResolvedValue(mockClient);
        mockPool.query.mockImplementation(async (...args: any[]) => {
          const sql = typeof args[0] === 'string' ? args[0] : '';
          if (sql.includes('select store_code')) return { rows: [{ store_code: 'STORE2' }] };
          if (sql.includes('select count(*)')) return { rows: [{ total: '0' }] };
          if (sql.includes('select id') && sql.includes('purchase_no')) {
            return { rows: [{ id: 'existing-id' }] };
          }
          return { rows: [] };
        });

        setupClientForInserts();
        const svc = new StoreOpsService(mockPool);
        const result = await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload());

        expect(result.purchase.purchaseNo).toMatch(/^PUR-STORE2-\d{6}$/);
      });
    });

    // ---------------------------------------------------------------
    // Payment status logic
    // ---------------------------------------------------------------

    describe('payment status', () => {
      it('should set payment_status to "pending" when paidAmount is 0', async () => {
        setupHappyPath();
        const svc = new StoreOpsService(mockPool);
        const result = await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload({ paidAmount: 0 }));

        expect(result.purchase.paidAmount).toBe(0);

        const purchaseInsert = mockClient.query.mock.calls.find(
          (call: any[]) => typeof call[0] === 'string' && call[0].includes('insert into procurement.purchases'),
        );
        expect(purchaseInsert).toBeDefined();
        // Params: tenantId($1), storeId($2), supplierId($3), locationId($4),
        // purchaseNo($5), today($6), subtotal($7), totalAmount($8), paidAmount($9),
        // paymentStatus($10), note($11), userId($12)
        expect(purchaseInsert![1][9]).toBe('pending');
      });

      it('should set payment_status to "paid" when paidAmount >= totalAmount', async () => {
        setupHappyPath();
        const svc = new StoreOpsService(mockPool);
        const result = await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload({ paidAmount: 1000 }));

        expect(result.purchase.paidAmount).toBe(1000);

        const purchaseInsert = mockClient.query.mock.calls.find(
          (call: any[]) => typeof call[0] === 'string' && call[0].includes('insert into procurement.purchases'),
        );
        expect(purchaseInsert![1][9]).toBe('paid');
      });

      it('should clamp paidAmount to totalAmount and set "paid"', async () => {
        setupHappyPath();
        const svc = new StoreOpsService(mockPool);
        const result = await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload({ paidAmount: 1500 }));

        expect(result.purchase.paidAmount).toBe(1000);

        const purchaseInsert = mockClient.query.mock.calls.find(
          (call: any[]) => typeof call[0] === 'string' && call[0].includes('insert into procurement.purchases'),
        );
        expect(purchaseInsert![1][9]).toBe('paid');
      });

      it('should set payment_status to "partial" when paidAmount is between 0 and totalAmount', async () => {
        setupHappyPath();
        const svc = new StoreOpsService(mockPool);
        const result = await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload({ paidAmount: 500 }));

        expect(result.purchase.paidAmount).toBe(500);

        const purchaseInsert = mockClient.query.mock.calls.find(
          (call: any[]) => typeof call[0] === 'string' && call[0].includes('insert into procurement.purchases'),
        );
        expect(purchaseInsert![1][9]).toBe('partial');
      });

      it('should record a purchase_payment row with correct amount and method when paidAmount > 0', async () => {
        setupHappyPath();
        const svc = new StoreOpsService(mockPool);
        await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload({ paidAmount: 500 }));

        const paymentInsert = mockClient.query.mock.calls.find(
          (call: any[]) => typeof call[0] === 'string' && call[0].includes('insert into procurement.purchase_payments'),
        );
        expect(paymentInsert).toBeDefined();
        // $1=purchaseId, $2=paymentMethod, $3=paidAmount, $4=reference, $5=userId
        expect(paymentInsert![1][1]).toBe('cash');
        expect(paymentInsert![1][2]).toBe(500);
      });

      it('should pass paymentReference as reference_no in the purchase_payments INSERT', async () => {
        setupHappyPath();
        const svc = new StoreOpsService(mockPool);
        await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload({
          paidAmount: 500,
          paymentReference: 'REF-12345',
        }));

        const paymentInsert = mockClient.query.mock.calls.find(
          (call: any[]) => typeof call[0] === 'string' && call[0].includes('insert into procurement.purchase_payments'),
        );
        expect(paymentInsert).toBeDefined();
        expect(paymentInsert![1][3]).toBe('REF-12345');
      });

      it('should NOT record a purchase_payment row when paidAmount is 0', async () => {
        setupHappyPath();
        const svc = new StoreOpsService(mockPool);
        await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload({ paidAmount: 0 }));

        const paymentInsert = mockClient.query.mock.calls.find(
          (call: any[]) => typeof call[0] === 'string' && call[0].includes('insert into procurement.purchase_payments'),
        );
        expect(paymentInsert).toBeUndefined();
      });
    });

    // ---------------------------------------------------------------
    // Full flow integration
    // ---------------------------------------------------------------

    describe('full flow', () => {
      it('should create product, SKU, purchase, inventory balance, and ledger in a transaction', async () => {
        setupHappyPath();
        const svc = new StoreOpsService(mockPool);
        const result = await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload());

        // Transaction lifecycle
        expect(mockClient.query).toHaveBeenCalledWith('begin');
        expect(mockClient.query).toHaveBeenCalledWith('commit');
        expect(mockClient.release).toHaveBeenCalled();

        // Product created
        expect(mockClient.query.mock.calls.some(
          (c: any[]) => typeof c[0] === 'string' && c[0].includes('insert into catalog.products'),
        )).toBe(true);

        // SKU created
        expect(mockClient.query.mock.calls.some(
          (c: any[]) => typeof c[0] === 'string' && c[0].includes('insert into catalog.skus'),
        )).toBe(true);

        // Purchase created
        expect(mockClient.query.mock.calls.some(
          (c: any[]) => typeof c[0] === 'string' && c[0].includes('insert into procurement.purchases'),
        )).toBe(true);

        // Purchase items
        expect(mockClient.query.mock.calls.some(
          (c: any[]) => typeof c[0] === 'string' && c[0].includes('insert into procurement.purchase_items'),
        )).toBe(true);

        // Inventory balance upserted
        expect(mockClient.query.mock.calls.some(
          (c: any[]) => typeof c[0] === 'string' && c[0].includes('insert into inventory.balances'),
        )).toBe(true);

        // Ledger entry with movement_type = purchase_receive (hardcoded in SQL, not parameterized)
        const ledgerInsert = mockClient.query.mock.calls.find(
          (c: any[]) => typeof c[0] === 'string' && c[0].includes('insert into inventory.ledger'),
        );
        expect(ledgerInsert).toBeDefined();
        expect(ledgerInsert![0]).toContain("'purchase_receive'");

        // Result structure
        expect(result.product).toBeDefined();
        expect(result.purchase).toBeDefined();
        expect(result.skus).toHaveLength(1);
        expect(result.stockUpdated).toBe(true);
      });

      it('should handle variants with multiple SKUs', async () => {
        setupHappyPath();
        const svc = new StoreOpsService(mockPool);
        const result = await svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload({
          hasVariants: true,
          variantLabels: ['Small', 'Medium', 'Large'],
          variantPrices: [120, 150, 180],
          variantCosts: [80, 100, 120],
        }));

        const skuInserts = mockClient.query.mock.calls.filter(
          (c: any[]) => typeof c[0] === 'string' && c[0].includes('insert into catalog.skus'),
        );
        expect(skuInserts).toHaveLength(3);

        const priceInserts = mockClient.query.mock.calls.filter(
          (c: any[]) => typeof c[0] === 'string' && c[0].includes('insert into catalog.prices'),
        );
        expect(priceInserts).toHaveLength(3);

        const itemInserts = mockClient.query.mock.calls.filter(
          (c: any[]) => typeof c[0] === 'string' && c[0].includes('insert into procurement.purchase_items'),
        );
        expect(itemInserts).toHaveLength(3);

        const balanceUpserts = mockClient.query.mock.calls.filter(
          (c: any[]) => typeof c[0] === 'string' && c[0].includes('insert into inventory.balances'),
        );
        expect(balanceUpserts).toHaveLength(3);

        const ledgerInserts = mockClient.query.mock.calls.filter(
          (c: any[]) => typeof c[0] === 'string' && c[0].includes('insert into inventory.ledger'),
        );
        expect(ledgerInserts).toHaveLength(3);

        expect(result.skus).toHaveLength(3);
      });

      it('should rollback on error', async () => {
        mockPool.connect.mockResolvedValue(mockClient);
        mockPool.query
          .mockResolvedValueOnce({ rows: [{ store_code: 'STORE2' }] })
          .mockResolvedValueOnce({ rows: [{ total: '0' }] })
          .mockResolvedValueOnce({ rows: [] });

        mockClient.query.mockImplementation(async (...args: any[]) => {
          const sql = typeof args[0] === 'string' ? args[0] : '';
          if (sql === 'begin') return { rows: [] };
          if (sql.includes('select tenant_id')) return { rows: [{ tenant_id: TENANT_ID, store_code: 'STORE2' }] };
          if (sql.includes('insert into catalog.products')) {
            throw new Error('Simulated DB error');
          }
          return { rows: [] };
        });

        const svc = new StoreOpsService(mockPool);
        await expect(
          svc.quickReceive(STORE_ID, AUTH_CONTEXT, SESSION, makePayload()),
        ).rejects.toThrow('Simulated DB error');

        expect(mockClient.query).toHaveBeenCalledWith('rollback');
        expect(mockClient.release).toHaveBeenCalled();
      });
    });
  });
});
