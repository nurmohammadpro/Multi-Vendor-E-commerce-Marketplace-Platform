'use client';

import { useEffect, useState } from 'react';

interface WarrantyAnalytics {
  totalDevices: number;
  devicesWithWarranty: number;
  warrantyPercentage: number;
  activeWarranties: number;
  expiredWarranties: number;
  expiringThisMonth: number;
  claimsSubmitted: number;
  claimsApproved: number;
  claimsRejected: number;
  claimsPending: number;
  averageClaimValue: number;
  topDeviceModels: Array<{ model: string; count: number }>;
  warrantyTypeBreakdown: Array<{ type: string; count: number }>;
}

interface WarrantyAnalyticsDashboardProps {
  storeId: string;
}

export function WarrantyAnalyticsDashboard({ storeId }: WarrantyAnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<WarrantyAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await fetch('/api/v1/analytics/warranty', {
          headers: { 'x-store-id': storeId },
        });

        if (!response.ok) throw new Error('Failed to fetch analytics');

        const data = await response.json();
        setAnalytics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('[v0] Error fetching analytics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [storeId]);

  if (isLoading) {
    return <div className="text-center py-8">Loading analytics...</div>;
  }

  if (error) {
    return <div className="text-red-600 py-8">{error}</div>;
  }

  if (!analytics) {
    return <div className="text-gray-500 py-8">No analytics data available</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Warranty Analytics</h1>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="Total Devices"
          value={analytics.totalDevices}
          icon="📦"
        />
        <MetricCard
          title="With Warranty"
          value={analytics.devicesWithWarranty}
          subtitle={`${analytics.warrantyPercentage}%`}
          icon="✅"
        />
        <MetricCard
          title="Active Warranties"
          value={analytics.activeWarranties}
          icon="🛡️"
        />
        <MetricCard
          title="Expiring This Month"
          value={analytics.expiringThisMonth}
          color="warning"
          icon="⏰"
        />
      </div>

      {/* Claims Overview */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Claims Overview</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Submitted:</span>
              <span className="font-semibold">{analytics.claimsSubmitted}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Approved:</span>
              <span className="font-semibold text-green-600">{analytics.claimsApproved}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Rejected:</span>
              <span className="font-semibold text-red-600">{analytics.claimsRejected}</span>
            </div>
            <div className="flex justify-between pt-3 border-t">
              <span className="text-gray-600 font-semibold">Pending:</span>
              <span className="font-semibold text-yellow-600">{analytics.claimsPending}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Warranty Value</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Average Claim Value</p>
              <p className="text-3xl font-bold">${analytics.averageClaimValue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Claims Value</p>
              <p className="text-3xl font-bold">
                ${(analytics.averageClaimValue * analytics.claimsApproved).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Top Devices & Warranty Types */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Top Device Models</h2>
          <div className="space-y-2">
            {analytics.topDeviceModels.slice(0, 5).map((model, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span className="text-gray-700">{model.model}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{
                        width: `${(model.count / Math.max(...analytics.topDeviceModels.map(m => m.count))) * 100}%`,
                      }}
                    ></div>
                  </div>
                  <span className="font-semibold text-sm">{model.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Warranty Types</h2>
          <div className="space-y-2">
            {analytics.warrantyTypeBreakdown.map((type, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span className="text-gray-700">{type.type}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{
                        width: `${(type.count / Math.max(...analytics.warrantyTypeBreakdown.map(t => t.count))) * 100}%`,
                      }}
                    ></div>
                  </div>
                  <span className="font-semibold text-sm">{type.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Key Insights */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-bold text-blue-900 mb-3">Key Insights</h2>
        <ul className="space-y-2 text-sm text-blue-800">
          <li>
            ✓ {analytics.warrantyPercentage}% of devices have active warranty coverage
          </li>
          <li>
            ✓ {analytics.expiringThisMonth} warranties expiring this month - send customer reminders
          </li>
          <li>
            ✓ {((analytics.claimsApproved / analytics.claimsSubmitted) * 100).toFixed(1)}% claim approval rate
          </li>
          <li>
            ✓ Average claim value: ${analytics.averageClaimValue.toFixed(2)}
          </li>
        </ul>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: number;
  subtitle?: string;
  color?: 'normal' | 'success' | 'warning' | 'danger';
  icon?: string;
}

function MetricCard({ title, value, subtitle, color = 'normal', icon }: MetricCardProps) {
  const colorClasses = {
    normal: 'bg-blue-50 border-blue-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    danger: 'bg-red-50 border-red-200',
  };

  const textColorClasses = {
    normal: 'text-blue-900',
    success: 'text-green-900',
    warning: 'text-yellow-900',
    danger: 'text-red-900',
  };

  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-sm font-medium ${textColorClasses[color]}`}>{title}</p>
          <p className={`text-3xl font-bold mt-2 ${textColorClasses[color]}`}>{value}</p>
          {subtitle && (
            <p className={`text-xs mt-1 ${textColorClasses[color]}`}>{subtitle}</p>
          )}
        </div>
        {icon && <span className="text-3xl">{icon}</span>}
      </div>
    </div>
  );
}
