'use client';

import { useState } from 'react';
import type { DeviceSerial } from '@mvp/types';

interface DeviceSerialsListProps {
  serials: DeviceSerial[];
  onRefresh: () => Promise<void>;
  isLoading?: boolean;
}

export function DeviceSerialsList({ serials, onRefresh, isLoading = false }: DeviceSerialsListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSerials = serials.filter(serial =>
    serial.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    serial.imeiNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    serial.deviceModel.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusColors = {
    in_stock: 'bg-green-100 text-green-800',
    reserved: 'bg-yellow-100 text-yellow-800',
    sold: 'bg-blue-100 text-blue-800',
    returned: 'bg-purple-100 text-purple-800',
    damaged: 'bg-red-100 text-red-800',
    lost: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Device Serials</h2>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <input
        type="text"
        placeholder="Search by serial, IMEI, or model..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Serial Number</th>
              <th className="px-4 py-2 text-left font-medium">IMEI</th>
              <th className="px-4 py-2 text-left font-medium">Device Model</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Batch Code</th>
              <th className="px-4 py-2 text-left font-medium">Warranty Linked</th>
              <th className="px-4 py-2 text-left font-medium">Received Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredSerials.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  {serials.length === 0 ? 'No device serials found' : 'No results match your search'}
                </td>
              </tr>
            ) : (
              filteredSerials.map((serial) => (
                <tr key={serial.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono font-semibold">{serial.serialNumber}</td>
                  <td className="px-4 py-2 font-mono text-xs">{serial.imeiNumber || '-'}</td>
                  <td className="px-4 py-2">{serial.deviceModel}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-semibold ${statusColors[serial.status as keyof typeof statusColors]}`}
                    >
                      {serial.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{serial.batchCode}</td>
                  <td className="px-4 py-2">
                    <span className={serial.warrantyLinked ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                      {serial.warrantyLinked ? '✓ Yes' : '✗ No'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {new Date(serial.receivedDate).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-gray-600 mt-4">
        Showing {filteredSerials.length} of {serials.length} device serials
      </div>
    </div>
  );
}
