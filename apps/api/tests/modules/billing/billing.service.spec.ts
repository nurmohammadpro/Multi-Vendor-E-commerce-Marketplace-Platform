import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

const mockPool = { query: vi.fn(), connect: vi.fn() };
const mockAudit = { recordUserAction: vi.fn(), recordStoreAction: vi.fn() };

vi.mock('pg', () => ({ default: { Pool: vi.fn(() => mockPool) } }));
vi.mock('../../../src/modules/database/database.constants.js', () => ({ DATABASE_POOL: 'DATABASE_POOL' }));
vi.mock('../../../src/modules/audit/audit.service.js', () => ({ AuditService: vi.fn(() => mockAudit) }));

let BillingService: any;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../../../src/modules/billing/billing.service.js');
  BillingService = mod.BillingService;
});

describe('BillingService', () => {
  describe('checkUserLimit', () => {
    it('should return { current, max } when under the user limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_users: 5, active_count: '3' }] });
      const svc = new BillingService(mockPool, mockAudit);
      const result = await svc.checkUserLimit('store-123');
      expect(result).toEqual({ current: 3, max: 5 });
    });

    it('should throw ForbiddenException when at the user limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_users: 3, active_count: '3' }] });
      const svc = new BillingService(mockPool, mockAudit);
      await expect(svc.checkUserLimit('store-123')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when over the user limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_users: 3, active_count: '5' }] });
      const svc = new BillingService(mockPool, mockAudit);
      await expect(svc.checkUserLimit('store-123')).rejects.toThrow(ForbiddenException);
    });

    it('should include current/max in the ForbiddenException message', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_users: 2, active_count: '2' }] });
      const svc = new BillingService(mockPool, mockAudit);
      try {
        await svc.checkUserLimit('store-123');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toContain('User limit reached');
        expect((error as ForbiddenException).message).toContain('2');
      }
    });

    it('should throw NotFoundException when no active subscription exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const svc = new BillingService(mockPool, mockAudit);
      await expect(svc.checkUserLimit('store-123')).rejects.toThrow(NotFoundException);
    });

    it('should pass the storeId to the SQL query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_users: 5, active_count: '2' }] });
      const svc = new BillingService(mockPool, mockAudit);
      await svc.checkUserLimit('store-456');
      expect(mockPool.query.mock.calls[0][1]).toContain('store-456');
    });
  });

  describe('checkLocationLimit', () => {
    it('should return { current, max } when under the location limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_locations: 2, active_count: '1' }] });
      const svc = new BillingService(mockPool, mockAudit);
      const result = await svc.checkLocationLimit('store-123');
      expect(result).toEqual({ current: 1, max: 2 });
    });

    it('should throw ForbiddenException when at the location limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_locations: 1, active_count: '1' }] });
      const svc = new BillingService(mockPool, mockAudit);
      await expect(svc.checkLocationLimit('store-123')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when over the location limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_locations: 1, active_count: '2' }] });
      const svc = new BillingService(mockPool, mockAudit);
      await expect(svc.checkLocationLimit('store-123')).rejects.toThrow(ForbiddenException);
    });

    it('should include current/max in the ForbiddenException message', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_locations: 1, active_count: '1' }] });
      const svc = new BillingService(mockPool, mockAudit);
      try {
        await svc.checkLocationLimit('store-123');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toContain('Location limit reached');
      }
    });

    it('should throw NotFoundException when no active subscription exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const svc = new BillingService(mockPool, mockAudit);
      await expect(svc.checkLocationLimit('store-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPlanLimits', () => {
    it('should return limits and usage for a store with active subscription', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_users: 3, max_locations: 1, features_json: '["stock","pos","staff"]' }] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ active_users: '2', total_locations: '1' }] });
      const svc = new BillingService(mockPool, mockAudit);
      const result = await svc.getPlanLimits('store-123', { type: 'store', storeId: 'store-123' });
      expect(result.limits).toEqual({ maxUsers: 3, maxLocations: 1, features: ['stock', 'pos', 'staff'] });
      expect(result.usage).toEqual({ activeUsers: 2, totalLocations: 1 });
    });

    it('should return null limits when no active subscription', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const svc = new BillingService(mockPool, mockAudit);
      const result = await svc.getPlanLimits('store-123', { type: 'store', storeId: 'store-123' });
      expect(result.limits).toBeNull();
      expect(result.usage).toBeNull();
    });
  });
});
