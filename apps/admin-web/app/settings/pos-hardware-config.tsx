'use client';

import { useState } from 'react';
import type { HardwareDevice } from '@mvp/types';

interface POSHardwareConfigProps {
  devices: HardwareDevice[];
  onAddDevice: (data: any) => Promise<void>;
  onUpdateDevice: (deviceId: string, data: any) => Promise<void>;
  onRemoveDevice: (deviceId: string) => Promise<void>;
  isLoading?: boolean;
}

export function POSHardwareConfig({
  devices,
  onAddDevice,
  onUpdateDevice,
  onRemoveDevice,
  isLoading = false,
}: POSHardwareConfigProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    deviceType: 'receipt_printer' as const,
    vendorId: '',
    productId: '',
    deviceName: '',
    protocol: 'TSPL' as const,
  });

  const deviceTypeLabels = {
    receipt_printer: '🖨️ Receipt Printer',
    label_printer: '🏷️ Label Printer',
    barcode_scanner: '📱 Barcode Scanner',
    cash_drawer: '💳 Cash Drawer',
  };

  const protocolLabels = {
    TSPL: 'TSPL (Thermal Printer)',
    ESC_POS: 'ESC/POS',
    HID: 'USB HID',
    ECS_POS: 'ECS POS',
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onAddDevice(formData);
      setFormData({
        deviceType: 'receipt_printer',
        vendorId: '',
        productId: '',
        deviceName: '',
        protocol: 'TSPL',
      });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding device:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">POS Hardware Devices</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {showAddForm ? 'Cancel' : 'Add Device'}
        </button>
      </div>

      {/* Add Device Form */}
      {showAddForm && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <h3 className="font-semibold mb-4">Register New Hardware Device</h3>
          <form onSubmit={handleAddDevice} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Device Type</label>
                <select
                  value={formData.deviceType}
                  onChange={(e) =>
                    setFormData({ ...formData, deviceType: e.target.value as any })
                  }
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  {Object.entries(deviceTypeLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Protocol</label>
                <select
                  value={formData.protocol}
                  onChange={(e) =>
                    setFormData({ ...formData, protocol: e.target.value as any })
                  }
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  {Object.entries(protocolLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Vendor ID (hex)</label>
                <input
                  type="text"
                  placeholder="e.g., 0471"
                  value={formData.vendorId}
                  onChange={(e) =>
                    setFormData({ ...formData, vendorId: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2 text-sm font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Product ID (hex)</label>
                <input
                  type="text"
                  placeholder="e.g., 0385"
                  value={formData.productId}
                  onChange={(e) =>
                    setFormData({ ...formData, productId: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2 text-sm font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Device Name</label>
              <input
                type="text"
                placeholder="e.g., Zebra TLP2844 Receipt Printer"
                value={formData.deviceName}
                onChange={(e) =>
                  setFormData({ ...formData, deviceName: e.target.value })
                }
                className="w-full border rounded px-3 py-2 text-sm"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Device'}
            </button>
          </form>
        </div>
      )}

      {/* Devices List */}
      <div className="space-y-3">
        {devices.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border rounded">
            No hardware devices configured
          </div>
        ) : (
          devices.map((device) => (
            <div key={device.id} className="border rounded-lg p-4 flex items-start justify-between hover:shadow-sm transition-shadow">
              <div className="flex-1">
                <p className="font-semibold">{device.deviceName}</p>
                <div className="text-sm text-gray-600 mt-1 grid grid-cols-2 gap-4">
                  <p>Type: {deviceTypeLabels[device.deviceType as keyof typeof deviceTypeLabels]}</p>
                  <p>Protocol: {protocolLabels[device.protocol as keyof typeof protocolLabels]}</p>
                  <p>Vendor ID: <span className="font-mono">{device.vendorId}</span></p>
                  <p>Product ID: <span className="font-mono">{device.productId}</span></p>
                </div>
                <div className="mt-2">
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                      device.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {device.status === 'active' ? '✓ Active' : device.status}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => onUpdateDevice(device.id, { status: device.status === 'active' ? 'inactive' : 'active' })}
                  className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                >
                  {device.status === 'active' ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => onRemoveDevice(device.id)}
                  className="px-3 py-1 text-sm bg-red-200 text-red-700 rounded hover:bg-red-300"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-semibold mb-2">POS Hardware Support:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Receipt Printers: TSPL, ESC/POS protocols</li>
          <li>Label Printers: TSPL protocol (4x6 shipping labels)</li>
          <li>Barcode Scanners: USB HID keyboard wedge</li>
          <li>Cash Drawers: RJ-11 kick protocol</li>
        </ul>
      </div>
    </div>
  );
}
