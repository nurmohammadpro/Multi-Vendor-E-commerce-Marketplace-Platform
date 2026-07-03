import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPool = { query: vi.fn(), connect: vi.fn() };
const mockAudit = { recordUserAction: vi.fn(), recordStoreAction: vi.fn() };

vi.mock('pg', () => ({ default: { Pool: vi.fn(() => mockPool) } }));
vi.mock('../../../src/modules/database/database.constants.js', () => ({ DATABASE_POOL: 'DATABASE_POOL' }));
vi.mock('../../../src/modules/audit/audit.service.js', () => ({ AuditService: vi.fn(() => mockAudit) }));

let PaymentsService: any;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../../../src/modules/payments/payments.service.js');
  PaymentsService = mod.PaymentsService;
});

describe('PaymentsService', () => {
  describe('listGateways', () => {
    it('should return gateways for a store', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'g1', provider_code: 'bkash', display_name: 'bKash' }] });
      const svc = new PaymentsService('DATABASE_POOL', mockAudit);
      const result = await svc.listGateways('store-1', { type: 'store', storeId: 'store-1' });
      expect(result.gateways).toHaveLength(1);
    });
    it('should reject missing store context', async () => {
      const svc = new PaymentsService('DATABASE_POOL', mockAudit);
      await expect(svc.listGateways(undefined, null)).rejects.toThrow('Store context is required');
    });
  });

  describe('listProviders', () => {
    it('should return bKash and SSLCommerz', async () => {
      const svc = new PaymentsService('DATABASE_POOL', mockAudit);
      const result = await svc.listProviders();
      const codes = result.providers.map((p: any) => p.code);
      expect(codes).toContain('bkash');
      expect(codes).toContain('sslcommerz');
    });
  });
});
