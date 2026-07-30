/**
 * USB HID Communication Utility for POS Hardware
 * Handles WebUSB API for thermal printers, barcode scanners, and other devices
 */

export interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
}

export interface USBDevice {
  vendorId: number;
  productId: number;
  productName: string;
}

/**
 * Check if WebUSB API is supported
 */
export function isWebUSBSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

/**
 * Request device from user
 */
export async function requestUSBDevice(filters?: USBDeviceFilter[]): Promise<any> {
  if (!isWebUSBSupported()) {
    throw new Error('WebUSB API is not supported in this browser');
  }

  try {
    const filters = [
      { vendorId: 0x0471, productId: 0x0385 }, // Zebra TLP2844
      { vendorId: 0x0a5f, productId: 0x1000 }, // Zebra GC420t
      { vendorId: 0x05e0, productId: 0x1200 }, // Zebra DS3678 Scanner
      // Add more devices as needed
    ];

    const device = await navigator.usb.requestDevice({ filters });
    return device;
  } catch (error) {
    if (error instanceof Error && error.message.includes('NotFoundError')) {
      throw new Error('No device selected');
    }
    throw error;
  }
}

/**
 * Get list of previously authorized devices
 */
export async function getAuthorizedUSBDevices(): Promise<any[]> {
  if (!isWebUSBSupported()) {
    return [];
  }

  try {
    return await navigator.usb.getDevices();
  } catch (error) {
    console.error('Error getting USB devices:', error);
    return [];
  }
}

/**
 * Connect to USB device
 */
export async function connectUSBDevice(device: any): Promise<void> {
  try {
    await device.open();
    console.log('[v0] Connected to USB device:', device.productName);
  } catch (error) {
    console.error('Error connecting to device:', error);
    throw error;
  }
}

/**
 * Disconnect from USB device
 */
export async function disconnectUSBDevice(device: any): Promise<void> {
  try {
    await device.close();
    console.log('[v0] Disconnected from USB device');
  } catch (error) {
    console.error('Error disconnecting from device:', error);
  }
}

/**
 * Send command to USB device
 */
export async function sendUSBCommand(
  device: any,
  command: Uint8Array,
  timeout: number = 5000
): Promise<void> {
  try {
    await device.transferOut(1, command);
    console.log('[v0] Sent command to USB device');
  } catch (error) {
    console.error('Error sending command:', error);
    throw error;
  }
}

/**
 * Read response from USB device
 */
export async function readUSBResponse(
  device: any,
  length: number = 64,
  timeout: number = 5000
): Promise<Uint8Array> {
  try {
    const result = await device.transferIn(1, length);
    return new Uint8Array(result.data.buffer);
  } catch (error) {
    console.error('Error reading from device:', error);
    throw error;
  }
}

/**
 * TSPL Command Builder for Thermal Printers
 */
export class TSPLPrinter {
  private device: any;
  private commands: string[] = [];

  constructor(device: any) {
    this.device = device;
  }

  /**
   * Add text to print
   */
  text(x: number, y: number, font: string, text: string): this {
    this.commands.push(`TEXT ${x},${y},"${font}",0,1,1,"${text}"`);
    return this;
  }

  /**
   * Add barcode
   */
  barcode(x: number, y: number, barcode: string, barcodeType: string = 'CODE128'): this {
    this.commands.push(`BARCODE ${x},${y},"${barcodeType}",100,1,0,2,"${barcode}"`);
    return this;
  }

  /**
   * Add QR code
   */
  qrcode(x: number, y: number, data: string): this {
    this.commands.push(`QRCODE ${x},${y},L,7,"${data}"`);
    return this;
  }

  /**
   * Draw line
   */
  line(x1: number, y1: number, x2: number, y2: number): this {
    this.commands.push(`LINE ${x1},${y1},${x2},${y2},2`);
    return this;
  }

  /**
   * Set print speed
   */
  speed(speed: number = 100): this {
    this.commands.push(`SPEED ${speed}`);
    return this;
  }

  /**
   * Set page size
   */
  pageSize(width: number, height: number): this {
    this.commands.push(`SIZE ${width}mm,${height}mm`);
    return this;
  }

  /**
   * Clear buffer
   */
  clear(): this {
    this.commands.push('CLS');
    return this;
  }

  /**
   * Print and advance
   */
  print(copies: number = 1): this {
    this.commands.push(`PRINT ${copies}`);
    return this;
  }

  /**
   * Build TSPL command string
   */
  build(): string {
    return this.commands.join('\n') + '\n';
  }

  /**
   * Send to printer
   */
  async send(): Promise<void> {
    const tsplCommand = this.build();
    const encoder = new TextEncoder();
    const data = encoder.encode(tsplCommand);
    await sendUSBCommand(this.device, data);
    console.log('[v0] TSPL command sent to printer');
  }

  /**
   * Reset command buffer
   */
  reset(): this {
    this.commands = [];
    return this;
  }
}

/**
 * Barcode Scanner Handler
 * Listens for HID keyboard wedge input
 */
export class BarcodeScanner {
  private isListening = false;
  private listeners: Array<(barcode: string) => void> = [];
  private scannedBuffer = '';
  private scanTimeoutId: NodeJS.Timeout | null = null;
  private readonly SCAN_TIMEOUT = 100; // ms

  /**
   * Start listening for barcode scans
   */
  startListening(): void {
    if (this.isListening) return;

    this.isListening = true;
    console.log('[v0] Barcode scanner listening...');

    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * Stop listening for barcode scans
   */
  stopListening(): void {
    this.isListening = false;
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    console.log('[v0] Barcode scanner stopped');
  }

  /**
   * Register callback for barcode scans
   */
  onScan(callback: (barcode: string) => void): void {
    this.listeners.push(callback);
  }

  /**
   * Handle keydown events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isListening) return;

    // Skip if modifier keys are pressed (except Shift)
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    // Handle Enter as scan terminator
    if (event.key === 'Enter') {
      if (this.scannedBuffer.length > 0) {
        this.fireBarcodeScan(this.scannedBuffer);
        this.scannedBuffer = '';
      }
      event.preventDefault();
      return;
    }

    // Accumulate characters
    if (event.key.length === 1) {
      this.scannedBuffer += event.key;

      // Reset timeout for continuous scanning
      if (this.scanTimeoutId) {
        clearTimeout(this.scanTimeoutId);
      }

      this.scanTimeoutId = setTimeout(() => {
        if (this.scannedBuffer.length > 0) {
          this.fireBarcodeScan(this.scannedBuffer);
          this.scannedBuffer = '';
        }
      }, this.SCAN_TIMEOUT);

      event.preventDefault();
    }
  }

  /**
   * Fire barcode scan event
   */
  private fireBarcodeScan(barcode: string): void {
    console.log('[v0] Barcode scanned:', barcode);
    this.listeners.forEach((callback) => callback(barcode));

    // Also dispatch custom event
    const event = new CustomEvent('barcode-scanned', {
      detail: { barcode, timestamp: new Date() },
    });
    document.dispatchEvent(event);
  }

  /**
   * Simulate a barcode scan (for testing)
   */
  simulateScan(barcode: string): void {
    this.fireBarcodeScan(barcode);
  }
}

/**
 * Cash Drawer Controller
 */
export class CashDrawer {
  private device: any;

  constructor(device: any) {
    this.device = device;
  }

  /**
   * Open cash drawer
   */
  async open(): Promise<void> {
    // ESC/POS drawer kick sequence
    const drawer = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0x19]);
    await sendUSBCommand(this.device, drawer);
    console.log('[v0] Cash drawer opened');
  }

  /**
   * Check if drawer is open (polling)
   */
  async isOpen(): Promise<boolean> {
    // This depends on device capabilities
    // Most USB drawers don't have status feedback
    return true;
  }
}
