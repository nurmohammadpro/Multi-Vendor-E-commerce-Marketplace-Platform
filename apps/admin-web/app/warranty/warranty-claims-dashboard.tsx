'use client';

import { useState } from 'react';
import type { WarrantyClaim } from '@mvp/types';

interface WarrantyClaimsDashboardProps {
  claims: WarrantyClaim[];
  onRefresh: () => Promise<void>;
  onApproveClaim: (claimId: string, resolution: string) => Promise<void>;
  onRejectClaim: (claimId: string, reason: string) => Promise<void>;
  isLoading?: boolean;
}

export function WarrantyClaimsDashboard({
  claims,
  onRefresh,
  onApproveClaim,
  onRejectClaim,
  isLoading = false,
}: WarrantyClaimsDashboardProps) {
  const [selectedTab, setSelectedTab] = useState<'submitted' | 'approved' | 'rejected' | 'all'>('submitted');
  const [selectedClaim, setSelectedClaim] = useState<WarrantyClaim | null>(null);

  const filteredClaims = claims.filter((claim) => {
    if (selectedTab === 'all') return true;
    if (selectedTab === 'submitted') return claim.status === 'submitted';
    if (selectedTab === 'approved') return claim.status === 'approved';
    if (selectedTab === 'rejected') return claim.status === 'rejected';
    return true;
  });

  const claimTypeLabels = {
    device_not_working: 'Device Not Working',
    partial_defect: 'Partial Defect',
    replacement_unit: 'Replacement Unit',
    repair: 'Repair',
    refund: 'Refund',
  };

  const statusColors = {
    submitted: 'bg-yellow-100 text-yellow-800',
    under_review: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Warranty Claims</h1>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b">
        {(['submitted', 'approved', 'rejected', 'all'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`px-4 py-2 font-medium border-b-2 -mb-1 ${
              selectedTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)} ({claims.filter(c => selectedTab === 'all' ? true : c.status === tab).length})
          </button>
        ))}
      </div>

      {/* Claims List */}
      <div className="grid gap-4">
        {filteredClaims.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No warranty claims in this category
          </div>
        ) : (
          filteredClaims.map((claim) => (
            <div key={claim.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-mono font-semibold text-sm">{claim.claimReferenceNumber}</p>
                  <p className="text-sm text-gray-600">Device Serial: {claim.deviceSerialId}</p>
                </div>
                <span
                  className={`inline-block px-3 py-1 rounded text-xs font-semibold ${
                    statusColors[claim.status as keyof typeof statusColors]
                  }`}
                >
                  {claim.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                <div>
                  <p className="text-gray-600">Claim Type:</p>
                  <p className="font-medium">
                    {claimTypeLabels[claim.claimType as keyof typeof claimTypeLabels]}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Submitted:</p>
                  <p className="font-medium">{new Date(claim.claimSubmittedDate).toLocaleDateString()}</p>
                </div>
              </div>

              <p className="text-sm mb-3">
                <span className="font-semibold">Issue:</span> {claim.issueDescription}
              </p>

              {claim.status === 'submitted' && (
                <div className="flex gap-2 pt-3 border-t">
                  <button
                    onClick={() => setSelectedClaim(claim)}
                    className="flex-1 px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm font-medium"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setSelectedClaim(claim)}
                    className="flex-1 px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm font-medium"
                  >
                    Reject
                  </button>
                </div>
              )}

              {claim.approvalNotes && (
                <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                  <p className="text-gray-600">Admin Notes: {claim.approvalNotes}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Claim Modal */}
      {selectedClaim && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold">Process Claim</h2>
            <p className="text-sm text-gray-600">{selectedClaim.claimReferenceNumber}</p>
            <textarea
              placeholder="Admin notes..."
              className="w-full border rounded px-3 py-2 text-sm"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedClaim(null)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onApproveClaim(selectedClaim.id, 'device_replacement');
                  setSelectedClaim(null);
                }}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
