export type AppContextType = 'admin' | 'store' | 'customer';

export type AuthContext =
  | { type: 'admin'; roles: string[] }
  | { type: 'store'; storeId: string; roles: string[] }
  | { type: 'customer'; customerId: string };

// ==================== PRODUCT CATEGORIES ====================
export type ProductCategoryType = 'tech_serial_tracked' | 'regular';

export interface ProductCategory {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  categoryType: ProductCategoryType;
  description?: string;
  requiresSerial: boolean;
  requiresWarranty: boolean;
  requiresImei: boolean;
  hasSpecifications: boolean;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

// ==================== TRACKING PROFILES ====================
export type TrackingFieldType = 'text' | 'number' | 'imei' | 'date';

export interface TrackingField {
  id: string;
  profileId: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: TrackingFieldType;
  isRequired: boolean;
  isUnique: boolean;
  validationRules: Record<string, any>;
  sortOrder: number;
  createdAt: Date;
}

export interface TrackingProfile {
  id: string;
  tenantId: string;
  name: string;
  categoryId?: string;
  isGlobal: boolean;
  status: 'active' | 'inactive';
  fields?: TrackingField[];
  createdAt: Date;
  updatedAt: Date;
}

// ==================== DEVICE SERIALS ====================
export type DeviceSerialStatus =
  | 'in_stock'
  | 'reserved'
  | 'sold'
  | 'returned'
  | 'damaged'
  | 'lost';

export interface DeviceSerial {
  id: string;
  tenantId: string;
  storeId: string;
  skuId: string;
  serialNumber: string; // Mandatory, unique per store
  imeiNumber?: string; // Mandatory for mobile phones
  deviceModel: string;
  specificationsJson?: Record<string, any>;
  color?: string;
  manufactureDateDate?: Date;
  batchCode: string;
  receivedDate: Date;
  currentLocationId?: string;
  status: DeviceSerialStatus;
  assignedToSaleId?: string;
  warrantyLinked: boolean;
  trackingValues: Record<string, string>; // Custom tracking field values
  trackingProfileId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== WARRANTY ====================
export type WarrantyType =
  | 'manufacturer_standard'
  | 'extended'
  | 'international'
  | 'accidental_damage'
  | 'premium';

export type WarrantyCoverageScope =
  | 'hardware_defect'
  | 'manufacturing_defect'
  | 'accidental_damage'
  | 'includes_service';

export interface WarrantyPolicy {
  id: string;
  tenantId: string;
  storeId: string;
  code: string;
  name: string;
  warrantyType: WarrantyType;
  durationMonths: number;
  coverageScope: WarrantyCoverageScope;
  appliesToCategoryIds: string[];
  costPrice?: number;
  costToStore?: number;
  isDefaultPolicy: boolean;
  termsText: string;
  exclusionsText?: string;
  claimProcessText?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export type SaleWarrantyStatus =
  | 'active'
  | 'claimed'
  | 'expired'
  | 'voided'
  | 'transferred';

export interface SaleWarranty {
  id: string;
  tenantId: string;
  storeId: string;
  saleId: string;
  saleItemId: string;
  deviceSerialId: string; // MANDATORY link to device serial
  warrantyPolicyId: string;
  warrantyReferenceNumber: string;
  warrantyStartDate: Date;
  warrantyEndDate: Date;
  warrantyPurchasedPrice?: number;
  status: SaleWarrantyStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type WarrantyClaimType =
  | 'device_not_working'
  | 'partial_defect'
  | 'replacement_unit'
  | 'repair'
  | 'refund';

export type WarrantyClaimStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'cancelled';

export type WarrantyResolutionType =
  | 'device_replacement'
  | 'repair_return'
  | 'refund'
  | 'store_credit';

export interface WarrantyClaim {
  id: string;
  tenantId: string;
  storeId: string;
  saleWarrantyId: string;
  deviceSerialId: string;
  claimType: WarrantyClaimType;
  issueDescription: string;
  issueDate: Date;
  claimSubmittedDate: Date;
  claimReferenceNumber: string;
  status: WarrantyClaimStatus;
  rejectionReason?: string;
  approvalNotes?: string;
  approvedByUserId?: string;
  approvedAt?: Date;
  resolutionType?: WarrantyResolutionType;
  replacementSerialId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== STOCK BATCHES ====================
export type StockBatchStatus = 'active' | 'depleted' | 'quarantined' | 'recalled';

export interface StockBatch {
  id: string;
  tenantId: string;
  storeId: string;
  batchCode: string;
  supplierId?: string;
  productId: string;
  skuId: string;
  purchaseOrderNumber: string;
  receivedDate: Date;
  manufactureBatchCode?: string;
  expiryDate?: Date;
  receivedQuantity: number;
  currentQuantity: number;
  serialCount: number;
  notes?: string;
  status: StockBatchStatus;
  recallReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== POS HARDWARE ====================
export type HardwareDeviceType =
  | 'receipt_printer'
  | 'label_printer'
  | 'barcode_scanner'
  | 'cash_drawer';

export type HardwareProtocol = 'TSPL' | 'ESC_POS' | 'HID' | 'ECS_POS';
export type HardwareInterfaceType = 'USB' | 'SERIAL' | 'NETWORK';
export type HardwareDeviceStatus =
  | 'active'
  | 'inactive'
  | 'error'
  | 'disconnected';

export interface HardwareDevice {
  id: string;
  tenantId: string;
  storeId: string;
  deviceType: HardwareDeviceType;
  vendorId: string; // USB vendor ID in hex
  productId: string; // USB product ID in hex
  deviceName: string;
  protocol: HardwareProtocol;
  interfaceType: HardwareInterfaceType;
  configurationJson: Record<string, any>;
  status: HardwareDeviceStatus;
  lastStatusCheck?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type PrintJobType = 'receipt' | 'label' | 'warranty_card';
export type PrintJobStatus = 'queued' | 'printing' | 'completed' | 'failed';

export interface PrintJob {
  id: string;
  tenantId: string;
  storeId: string;
  hardwareDeviceId: string;
  jobType: PrintJobType;
  referenceId: string; // sale_id, sale_item_id, or warranty_id
  contentJson: Record<string, any>;
  tsplCommand?: string;
  status: PrintJobStatus;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

// ==================== HARDWARE COMMUNICATION TYPES ====================
export interface BarcodeScannedEvent {
  barcode: string;
  timestamp: Date;
  scannerDeviceId: string;
}

export interface PrintQueueItem {
  jobId: string;
  deviceId: string;
  priority: 'low' | 'normal' | 'high';
  retryCount: number;
  maxRetries: number;
}

export interface HardwareDeviceConfig {
  receipt_printer?: {
    vendorId: string;
    productId: string;
    protocol: 'TSPL' | 'ESC_POS';
    paperWidth: string;
    dpi: number;
  };
  label_printer?: {
    vendorId: string;
    productId: string;
    protocol: 'TSPL';
    labelWidth: string;
    labelHeight: string;
    dpi: number;
  };
  barcode_scanner?: {
    vendorId: string;
    productId: string;
    protocol: 'HID';
    inputMethod: 'keyboard_wedge';
    terminator: 'enter' | 'tab';
    autoFocus: boolean;
  };
  cash_drawer?: {
    vendorId: string;
    productId: string;
    protocol: 'ESC_POS';
  };
}
