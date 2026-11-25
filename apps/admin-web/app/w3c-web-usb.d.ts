/**
 * Minimal W3C WebUSB API type declarations
 * See: https://wicg.github.io/webusb/
 */
interface USBDevice {
  vendorId: number;
  productId: number;
  productName: string;
  manufacturerName?: string;
  serialNumber?: string;
  open(): Promise<void>;
  close(): Promise<void>;
  transferOut(endpoint: number, data: BufferSource): Promise<USBTransferOutResult>;
  transferIn(endpoint: number, length: number): Promise<USBTransferInResult>;
}

interface USBTransferOutResult {
  bytesWritten: number;
  status: 'ok';
}

interface USBTransferInResult {
  data: DataView;
  status: 'ok' | 'stall' | 'babble';
}

interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
  classCode?: number;
  subclassCode?: number;
  protocolCode?: number;
  serialNumber?: string;
}

interface USB {
  requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>;
  getDevices(): Promise<USBDevice[]>;
}

interface Navigator {
  readonly usb: USB;
}
