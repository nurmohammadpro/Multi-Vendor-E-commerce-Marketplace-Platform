'use client';

import { useState, useCallback } from 'react';
import type { DeviceSerial } from '@mvp/types';

interface UseDeviceSerialsOptions {
  storeId: string;
}

export function useDeviceSerials({ storeId }: UseDeviceSerialsOptions) {
  const [serials, setSerials] = useState<DeviceSerial[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSerials = useCallback(async (filters?: {
    serialNumber?: string;
    imeiNumber?: string;
    batchCode?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters?.serialNumber) params.append('serialNumber', filters.serialNumber);
      if (filters?.imeiNumber) params.append('imeiNumber', filters.imeiNumber);
      if (filters?.batchCode) params.append('batchCode', filters.batchCode);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());

      const response = await fetch(
        `/api/v1/inventory/serials/search/all?${params.toString()}`,
        {
          headers: { 'x-store-id': storeId },
        },
      );

      if (!response.ok) throw new Error('Failed to fetch device serials');

      const data = await response.json();
      setSerials(data.serials || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[v0] Error fetching device serials:', err);
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  const createSerial = useCallback(async (data: {
    skuId: string;
    serialNumber: string;
    imeiNumber?: string;
    deviceModel: string;
    color?: string;
    manufactureDateDate?: Date;
    batchCode: string;
    currentLocationId?: string;
    specificationsJson?: Record<string, any>;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/inventory/serials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-store-id': storeId,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Failed to create device serial');

      const newSerial = await response.json();
      setSerials((prev) => [newSerial, ...prev]);
      return newSerial;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[v0] Error creating device serial:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  const bulkImportSerials = useCallback(async (
    serials: Array<{
      serialNumber: string;
      imeiNumber?: string;
      deviceModel: string;
      skuId: string;
      batchCode: string;
      color?: string;
      specifications?: Record<string, any>;
    }>,
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/inventory/serials/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-store-id': storeId,
        },
        body: JSON.stringify({ serials }),
      });

      if (!response.ok) throw new Error('Failed to import device serials');

      const result = await response.json();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[v0] Error bulk importing device serials:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  const updateSerialStatus = useCallback(async (
    serialId: string,
    status: string,
    assignedToSaleId?: string,
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/inventory/serials/${serialId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-store-id': storeId,
          },
          body: JSON.stringify({ status, assignedToSaleId }),
        },
      );

      if (!response.ok) throw new Error('Failed to update device serial status');

      const updated = await response.json();
      setSerials((prev) =>
        prev.map((s) => (s.id === serialId ? updated : s)),
      );
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[v0] Error updating device serial status:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  return {
    serials,
    isLoading,
    error,
    fetchSerials,
    createSerial,
    bulkImportSerials,
    updateSerialStatus,
  };
}
