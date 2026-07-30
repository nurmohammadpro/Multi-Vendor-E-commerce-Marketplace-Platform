'use client';

import { useState, useCallback } from 'react';
import type { WarrantyClaim, WarrantyPolicy } from '@mvp/types';

interface UseWarrantyOptions {
  storeId: string;
}

export function useWarranty({ storeId }: UseWarrantyOptions) {
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [policies, setPolicies] = useState<WarrantyPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClaims = useCallback(async (filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());

      const response = await fetch(
        `/api/v1/warranty/claims?${params.toString()}`,
        {
          headers: { 'x-store-id': storeId },
        },
      );

      if (!response.ok) throw new Error('Failed to fetch warranty claims');

      const data = await response.json();
      setClaims(data.claims || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[v0] Error fetching warranty claims:', err);
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  const submitClaim = useCallback(async (data: {
    saleWarrantyId: string;
    deviceSerialId: string;
    claimType: string;
    issueDescription: string;
    issueDate: Date;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/warranty/claims', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-store-id': storeId,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Failed to submit warranty claim');

      const newClaim = await response.json();
      setClaims((prev) => [newClaim, ...prev]);
      return newClaim;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[v0] Error submitting warranty claim:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  const resolveClaim = useCallback(async (
    claimId: string,
    data: {
      status: string;
      rejectionReason?: string;
      approvalNotes?: string;
      resolutionType?: string;
      replacementSerialId?: string;
    },
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/warranty/claims/${claimId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-store-id': storeId,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Failed to resolve warranty claim');

      const updated = await response.json();
      setClaims((prev) =>
        prev.map((c) => (c.id === claimId ? updated : c)),
      );
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[v0] Error resolving warranty claim:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  const createPolicy = useCallback(async (data: {
    code: string;
    name: string;
    warrantyType: string;
    durationMonths: number;
    coverageScope: string;
    appliesToCategoryIds: string[];
    costPrice?: number;
    costToStore?: number;
    isDefaultPolicy?: boolean;
    termsText: string;
    exclusionsText?: string;
    claimProcessText?: string;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/warranty/policies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-store-id': storeId,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Failed to create warranty policy');

      const newPolicy = await response.json();
      setPolicies((prev) => [...prev, newPolicy]);
      return newPolicy;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('[v0] Error creating warranty policy:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  return {
    claims,
    policies,
    isLoading,
    error,
    fetchClaims,
    submitClaim,
    resolveClaim,
    createPolicy,
  };
}
