'use client';

import { useState, useEffect } from 'react';

interface HistoryEvent {
  id: string;
  timestamp: Date;
  eventType: string;
  description: string;
  actor?: string;
  metadata?: Record<string, any>;
}

interface DeviceHistoryProps {
  serialNumber: string;
  storeId: string;
}

export function DeviceHistory({ serialNumber, storeId }: DeviceHistoryProps) {
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(
          `/api/v1/inventory/serials/search/all?serialNumber=${serialNumber}`,
          {
            headers: { 'x-store-id': storeId },
          }
        );

        if (!response.ok) throw new Error('Failed to fetch device');

        const data = await response.json();
        if (data.serials && data.serials.length > 0) {
          const serial = data.serials[0];
          
          // Fetch history events
          const historyResponse = await fetch(
            `/api/v1/inventory/serials/${serial.id}/history`,
            {
              headers: { 'x-store-id': storeId },
            }
          );

          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            setHistory(historyData.events || []);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('[v0] Error fetching device history:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [serialNumber, storeId]);

  if (isLoading) {
    return <div className="text-center py-8">Loading device history...</div>;
  }

  if (error) {
    return <div className="text-red-600 py-8">{error}</div>;
  }

  const eventTypeConfig = {
    received: { icon: '📦', color: 'bg-blue-100 text-blue-800', label: 'Received' },
    location_changed: { icon: '📍', color: 'bg-purple-100 text-purple-800', label: 'Location Changed' },
    sold: { icon: '💳', color: 'bg-green-100 text-green-800', label: 'Sold' },
    returned: { icon: '↩️', color: 'bg-orange-100 text-orange-800', label: 'Returned' },
    damaged: { icon: '⚠️', color: 'bg-red-100 text-red-800', label: 'Marked Damaged' },
    warranty_created: { icon: '🛡️', color: 'bg-indigo-100 text-indigo-800', label: 'Warranty Created' },
    warranty_claimed: { icon: '🔧', color: 'bg-yellow-100 text-yellow-800', label: 'Warranty Claim' },
    warranty_approved: { icon: '✅', color: 'bg-green-100 text-green-800', label: 'Claim Approved' },
    replaced: { icon: '🔄', color: 'bg-cyan-100 text-cyan-800', label: 'Device Replaced' },
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Device History Timeline</h2>

      {history.length === 0 ? (
        <div className="text-center py-8 text-gray-500 border rounded">
          No history events for this device
        </div>
      ) : (
        <div className="relative">
          {/* Timeline */}
          <div className="space-y-6">
            {history.map((event, idx) => {
              const config = eventTypeConfig[event.eventType as keyof typeof eventTypeConfig] || {
                icon: '📝',
                color: 'bg-gray-100 text-gray-800',
                label: event.eventType,
              };

              return (
                <div key={event.id} className="flex gap-4">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-lg ${config.color}`}
                    >
                      {config.icon}
                    </div>
                    {idx < history.length - 1 && (
                      <div className="w-1 h-12 bg-gray-300 my-2"></div>
                    )}
                  </div>

                  {/* Event content */}
                  <div className="flex-1 pt-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-lg">{config.label}</p>
                        <p className="text-gray-600 text-sm">
                          {new Date(event.timestamp).toLocaleString()}
                        </p>
                      </div>
                      {event.actor && (
                        <p className="text-sm text-gray-500">
                          By: <span className="font-mono">{event.actor}</span>
                        </p>
                      )}
                    </div>

                    <p className="text-gray-700 mt-1">{event.description}</p>

                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                          View details
                        </summary>
                        <div className="mt-2 p-3 bg-gray-50 rounded font-mono text-xs overflow-auto max-h-40">
                          <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-8 p-4 bg-gray-50 rounded">
        <h3 className="font-semibold mb-3">Event Types</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {Object.entries(eventTypeConfig).map(([key, config]) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`inline-block w-6 h-6 rounded-full flex items-center justify-center text-sm ${config.color}`}>
                {config.icon}
              </span>
              <span>{config.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
