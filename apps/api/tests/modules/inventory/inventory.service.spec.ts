import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPool = { query: vi.fn(), connect: vi.fn() };
const mockAudit = { recordUserAction: vi.fn(), recordStoreAction: vi.fn() };

vi.mock('pg', () => ({ default: { Pool: vi.fn(() => mockPool) } }));
vi.mock('../../../src/modules/database/database.constants.js', () => ({ DATABASE_POOL: 'DATABASE_POOL' }));
vi.mock('../../../src/modules/audit/audit.service.js', () => ({ AuditService: vi.fn(() => mockAudit) }));

let InventoryService: any;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../../../src/modules/inventory/inventory.service.js');
  InventoryService = mod.InventoryService;
});

describe('InventoryService', () => {
  describe('listBalances', () => {
    it('should return inventory balances for a store', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ sku_code: 'SKU-001', on_hand_qty: '10', available_qty: '8' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      const svc = new InventoryService('DATABASE_POOL', mockAudit);
      const result = await svc.listBalances('store-1', { type: 'store', storeId: 'store-1' }, {});
      expect(result.balances).toHaveLength(1);
    });
  });

  describe('listLedger', () => {
    it('should return immutable ledger entries', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ change_type: 'sale', on_hand_change: '-1', sku_code: 'SKU-001' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      const svc = new InventoryService('DATABASE_POOL', mockAudit);
      const result = await svc.listLedger('store-1', { type: 'store', storeId: 'store-1' }, {});
      expect(result.entries).toHaveLength(1);
    });
  });
});
