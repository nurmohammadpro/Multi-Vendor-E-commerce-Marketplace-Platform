'use client';

import { useState, useEffect, useRef } from 'react';
import type { HardwareDevice, PrintJob } from '@mvp/types';
import { BarcodeScanner } from '@/lib/hardware/usb-hid';
import { PrintQueueManager } from '@/lib/hardware/print-queue-manager';
import { ReceiptPrinter } from '@/lib/hardware/receipt-printer';

interface POSTerminalProps {
  storeId: string;
  onSaleComplete: (saleData: any) => Promise<void>;
}

interface CartItem {
  skuId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  deviceSerial?: string;
  deviceImei?: string;
}

export function POSTerminal({ storeId, onSaleComplete }: POSTerminalProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [printQueueStatus, setPrintQueueStatus] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const barcodeScanner = useRef<BarcodeScanner | null>(null);
  const printQueueManager = useRef<PrintQueueManager | null>(null);

  // Initialize hardware on mount
  useEffect(() => {
    const initializeHardware = async () => {
      try {
        // Load configured hardware devices
        const response = await fetch('/api/v1/pos/hardware/devices', {
          headers: { 'x-store-id': storeId },
        });

        if (response.ok) {
          const devicesData = await response.json();
          setDevices(devicesData);
        }

        // Initialize barcode scanner
        barcodeScanner.current = new BarcodeScanner();
        barcodeScanner.current.startListening();
        barcodeScanner.current.onScan((barcode) => {
          handleBarcodeScan(barcode);
        });

        // Initialize print queue
        printQueueManager.current = new PrintQueueManager(storeId);
        printQueueManager.current.startProcessing();
        printQueueManager.current.onStatusChange((status) => {
          setPrintQueueStatus(status);
        });
      } catch (error) {
        console.error('[v0] Error initializing hardware:', error);
      }
    };

    initializeHardware();

    return () => {
      barcodeScanner.current?.stopListening();
      printQueueManager.current?.stopProcessing();
    };
  }, [storeId]);

  const handleBarcodeScan = async (barcode: string) => {
    console.log('[v0] Barcode scanned:', barcode);
    setScannedBarcode(barcode);

    // Look up product by barcode/serial
    try {
      const response = await fetch(
        `/api/v1/inventory/serials/search/all?serialNumber=${barcode}`,
        {
          headers: { 'x-store-id': storeId },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.serials && data.serials.length > 0) {
          const serial = data.serials[0];

          // Fetch product details
          const productResponse = await fetch(`/api/v1/products/${serial.skuId}`);
          if (productResponse.ok) {
            const product = await productResponse.json();

            // Add to cart
            addToCart({
              skuId: serial.skuId,
              productName: product.name || serial.deviceModel,
              quantity: 1,
              unitPrice: product.price || 0,
              deviceSerial: serial.serialNumber,
              deviceImei: serial.imeiNumber,
            });
          }
        }
      }
    } catch (error) {
      console.error('[v0] Error looking up scanned item:', error);
    }
  };

  const addToCart = (item: CartItem) => {
    setCart((prevCart) => {
      const existing = prevCart.find((ci) => ci.skuId === item.skuId);
      if (existing) {
        return prevCart.map((ci) =>
          ci.skuId === item.skuId ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [...prevCart, item];
    });

    setScannedBarcode('');
  };

  const removeFromCart = (skuId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.skuId !== skuId));
  };

  const getTotals = () => {
    const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const tax = subtotal * 0.1; // 10% tax
    const total = subtotal + tax;

    return { subtotal, tax, total };
  };

  const completeSale = async () => {
    if (cart.length === 0) {
      alert('Cart is empty');
      return;
    }

    setIsProcessing(true);

    try {
      const { subtotal, tax, total } = getTotals();

      // Create sale via API
      const saleResponse = await fetch('/api/v1/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-store-id': storeId,
        },
        body: JSON.stringify({
          items: cart,
          subtotal,
          tax,
          total,
          paymentMethod: 'cash',
        }),
      });

      if (!saleResponse.ok) {
        throw new Error('Failed to create sale');
      }

      const sale = await saleResponse.json();

      // Generate and queue receipt
      const receiptPrinter = new ReceiptPrinter();
      const receiptPrinterDevice = devices.find((d) => d.deviceType === 'receipt_printer');

      if (receiptPrinterDevice) {
        const tsplCommand = receiptPrinter.generateReceiptTSPL({
          title: 'Sale Receipt',
          orderNumber: sale.id,
          date: new Date(),
          items: cart,
          subtotal,
          tax,
          total,
          paymentMethod: 'cash',
          deviceSerial: cart[0]?.deviceSerial,
          deviceImei: cart[0]?.deviceImei,
          storeName: 'Tech Store',
        });

        // Queue print job
        if (printQueueManager.current) {
          await printQueueManager.current.addPrintJob(
            {
              id: `receipt-${sale.id}`,
              tenantId: '',
              storeId,
              hardwareDeviceId: receiptPrinterDevice.id,
              jobType: 'receipt',
              referenceId: sale.id,
              contentJson: { orderNumber: sale.id, items: cart, total },
              tsplCommand,
              status: 'queued',
              createdAt: new Date(),
            },
            receiptPrinterDevice,
            'high'
          );
        }
      }

      // Generate and queue label for device serials
      const labelPrinterDevice = devices.find((d) => d.deviceType === 'label_printer');

      if (labelPrinterDevice && cart[0]?.deviceSerial) {
        const labelPrinter = new ReceiptPrinter();
        const tsplLabel = labelPrinter.generateShippingLabelTSPL({
          serialNumber: cart[0].deviceSerial,
          deviceModel: cart[0].productName,
          deviceColor: 'Standard',
        });

        if (printQueueManager.current) {
          await printQueueManager.current.addPrintJob(
            {
              id: `label-${sale.id}`,
              tenantId: '',
              storeId,
              hardwareDeviceId: labelPrinterDevice.id,
              jobType: 'label',
              referenceId: sale.id,
              contentJson: { serialNumber: cart[0].deviceSerial },
              tsplCommand: tsplLabel,
              status: 'queued',
              createdAt: new Date(),
            },
            labelPrinterDevice,
            'normal'
          );
        }
      }

      // Callback
      await onSaleComplete(sale);

      // Clear cart
      setCart([]);
    } catch (error) {
      console.error('[v0] Error completing sale:', error);
      alert('Error completing sale: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  const { subtotal, tax, total } = getTotals();

  return (
    <div className="grid grid-cols-3 gap-4 h-screen bg-gray-100 p-4">
      {/* Main Cart Area */}
      <div className="col-span-2 bg-white rounded-lg shadow-lg p-4 flex flex-col">
        <h1 className="text-2xl font-bold mb-4">POS Terminal</h1>

        {/* Barcode Input */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Scan barcode or serial number..."
            value={scannedBarcode}
            onChange={(e) => setScannedBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && scannedBarcode) {
                handleBarcodeScan(scannedBarcode);
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto mb-4 border rounded">
          {cart.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Scan items to add to cart
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">Product</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cart.map((item) => (
                  <tr key={item.skuId} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div>{item.productName}</div>
                      {item.deviceSerial && (
                        <div className="text-xs text-gray-500 font-mono">
                          Serial: {item.deviceSerial}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{item.quantity}</td>
                    <td className="px-4 py-2 text-right">${item.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-semibold">
                      ${(item.quantity * item.unitPrice).toFixed(2)}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => removeFromCart(item.skuId)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Totals */}
        <div className="bg-gray-50 p-4 rounded space-y-2">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax (10%):</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>Total:</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Sidebar - Hardware & Status */}
      <div className="space-y-4">
        {/* Hardware Status */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-bold mb-3">Hardware</h2>
          <div className="space-y-2 text-sm">
            {devices.map((device) => (
              <div key={device.id} className="flex items-center justify-between">
                <span>{device.deviceName}</span>
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    device.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {device.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Print Queue */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-bold mb-3">Print Queue</h2>
          {printQueueStatus && (
            <div className="space-y-2 text-sm">
              <p>Queue Length: {printQueueStatus.queueLength}</p>
              <p>
                Status:{' '}
                <span
                  className={
                    printQueueStatus.isProcessing ? 'text-green-600 font-bold' : 'text-gray-600'
                  }
                >
                  {printQueueStatus.isProcessing ? 'Processing' : 'Idle'}
                </span>
              </p>
              <p>Connected Devices: {printQueueStatus.connectedDevices}</p>
            </div>
          )}
        </div>

        {/* Complete Sale Button */}
        <button
          onClick={completeSale}
          disabled={cart.length === 0 || isProcessing}
          className="w-full px-4 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 disabled:opacity-50"
        >
          {isProcessing ? 'Processing...' : 'Complete Sale'}
        </button>
      </div>
    </div>
  );
}
