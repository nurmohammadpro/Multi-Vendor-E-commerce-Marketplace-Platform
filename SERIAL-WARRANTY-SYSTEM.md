# Serial Number-Based Warranty Tracking System

## Overview

This document describes the implementation of a comprehensive serial number-based warranty tracking system for tech and electronics products, including POS hardware integration (USB HID, TSPL thermal printers, and barcode scanners).

## Architecture

### Database Schema

The system extends the existing PostgreSQL schema with the following key tables:

#### `catalog.product_categories`
Categorizes products and determines which require serial tracking.

**Key Fields:**
- `code`: Unique product category code
- `category_type`: `'tech_serial_tracked'` or `'regular'`
- `requires_serial`: Boolean flag to enforce serial tracking
- `requires_warranty`: Boolean flag for warranty management
- `requires_imei`: Boolean for mobile device IMEI (mobile phones only)

**Tech Categories (Pre-seeded):**
- PC_COMPONENTS
- LAPTOPS
- MOBILE_PHONES
- MOBILE_ACCESSORIES
- WEARABLES
- IOT_DEVICES
- DRONES
- ELECTRONICS
- ELECTRICAL_GOODS
- REGULAR (backward compatible)

#### `inventory.device_serials`
Tracks individual device units with complete lifecycle management.

**Key Fields:**
- `serial_number`: Unique per store (MANDATORY for tech products)
- `imei_number`: MANDATORY for mobile devices
- `device_model`: Snapshot of product model
- `batch_code`: Links to `stock_batches` (immutable)
- `status`: `'in_stock'` | `'reserved'` | `'sold'` | `'returned'` | `'damaged'` | `'lost'`
- `assigned_to_sale_id`: Immutable link to sale when sold
- `warranty_linked`: Boolean indicating if warranty created
- `specifications_json`: JSONB storing device-specific specs at receipt time

**Constraints:**
- Unique constraint: `(store_id, serial_number)`
- Cannot delete (only archive)
- Audit trail via inventory ledger

#### `catalog.warranty_policies`
Defines warranty types and coverage.

**Key Fields:**
- `warranty_type`: `'manufacturer_standard'` | `'extended'` | `'international'` | `'accidental_damage'` | `'premium'`
- `duration_months`: How long warranty lasts
- `coverage_scope`: What's covered (hardware_defect, manufacturing_defect, accidental_damage, includes_service)
- `applies_to_category_ids`: Array of product categories this applies to
- `cost_price`: Customer-facing cost (optional, if sold separately)
- `cost_to_store`: Store's cost for warranty
- `is_default_policy`: Auto-apply to sales

#### `sales.sale_warranties`
Links warranty to specific device serial and sale.

**Key Relationship:**
```
DeviceSerial --1:1-- SaleWarranty
               ↓
          WarrantyPolicy
```

**Key Fields:**
- `device_serial_id`: MANDATORY immutable link to device
- `warranty_reference_number`: Unique ticket ID for customer
- `warranty_start_date`: Typically sale date
- `warranty_end_date`: Calculated from start + duration_months
- `status`: `'active'` | `'claimed'` | `'expired'` | `'voided'` | `'transferred'`

**Automatic Behavior:**
- Created automatically when tech product is sold
- Cannot be modified after sale completion
- References updated on device replacement

#### `sales.warranty_claims`
Manages warranty claims and approval workflow.

**Key Fields:**
- `claim_type`: `'device_not_working'` | `'partial_defect'` | `'replacement_unit'` | `'repair'` | `'refund'`
- `status`: `'submitted'` | `'under_review'` | `'approved'` | `'rejected'` | `'completed'` | `'cancelled'`
- `resolution_type`: `'device_replacement'` | `'repair_return'` | `'refund'` | `'store_credit'`
- `approved_by_user_id`: Admin who approved the claim
- `replacement_serial_id`: New device serial if replacement provided

#### `inventory.stock_batches`
Groups devices by supplier shipment for quality control and recall management.

**Key Fields:**
- `batch_code`: Unique per store (immutable)
- `manufacture_batch_code`: Manufacturer's batch code
- `serial_count`: Count of tracked serials in batch
- `status`: `'active'` | `'depleted'` | `'quarantined'` | `'recalled'`
- `recall_reason`: If status = 'recalled'

#### `pos.hardware_devices`
Registers USB hardware for POS operations.

**Key Fields:**
- `device_type`: `'receipt_printer'` | `'label_printer'` | `'barcode_scanner'` | `'cash_drawer'`
- `vendor_id`: USB vendor ID (hex)
- `product_id`: USB product ID (hex)
- `protocol`: `'TSPL'` | `'ESC_POS'` | `'HID'` | `'ECS_POS'`
- `interface_type`: `'USB'` | `'SERIAL'` | `'NETWORK'`
- `configuration_json`: Device-specific settings

**Example Configuration:**
```json
{
  "receipt_printer": {
    "paper_width": "80mm",
    "dpi": "203",
    "default_font": "A"
  }
}
```

#### `pos.print_jobs`
Queue system for print jobs (receipts, labels, warranty cards).

**Key Fields:**
- `job_type`: `'receipt'` | `'label'` | `'warranty_card'`
- `status`: `'queued'` | `'printing'` | `'completed'` | `'failed'`
- `tspl_command`: Raw TSPL command string

---

## API Endpoints

### Device Serials API

```
POST   /v1/inventory/serials
POST   /v1/inventory/serials/bulk-import
GET    /v1/inventory/serials/:serialId
GET    /v1/inventory/serials/search/all?serialNumber=ABC&status=in_stock
PATCH  /v1/inventory/serials/:serialId/status
GET    /v1/inventory/serials/batch/:batchCode
```

### Warranty API

```
POST   /v1/warranty/policies
GET    /v1/warranty/policies
POST   /v1/warranty/sale-warranties
GET    /v1/warranty/serials/:serialId
POST   /v1/warranty/claims
GET    /v1/warranty/claims?status=submitted&limit=50
PATCH  /v1/warranty/claims/:claimId
```

### POS Hardware API

```
POST   /v1/pos/hardware/devices
GET    /v1/pos/hardware/devices
GET    /v1/pos/hardware/devices/:deviceId
PATCH  /v1/pos/hardware/devices/:deviceId
DELETE /v1/pos/hardware/devices/:deviceId
POST   /v1/pos/hardware/print-jobs
GET    /v1/pos/hardware/print-jobs?limit=50
PATCH  /v1/pos/hardware/print-jobs/:jobId
```

---

## Services

### DeviceSerialsService (`apps/api/src/modules/inventory/device-serials.service.ts`)

Manages individual device serial records.

**Key Methods:**
- `createDeviceSerial()`: Create single serial with validation
- `bulkImportSerials()`: CSV/batch import with error tracking
- `getDeviceSerial()`: Retrieve by ID
- `searchSerials()`: Search by serial, IMEI, batch, status
- `updateDeviceSerialStatus()`: Track status changes (in_stock → sold → returned, etc.)
- `getSerialsByBatchCode()`: Retrieve all serials in batch

### WarrantyService (`apps/api/src/modules/catalog/warranty.service.ts`)

Manages warranty policies, creation, and claims.

**Key Methods:**
- `createWarrantyPolicy()`: Define warranty terms
- `createSaleWarranty()`: Auto-create warranty on sale
- `getWarrantyBySerial()`: Lookup active warranty for device
- `submitWarrantyClaim()`: Customer/store initiates claim
- `resolveWarrantyClaim()`: Admin approve/reject with resolution
- `getWarrantyClaims()`: Dashboard query with status filtering

### HardwareService (`apps/api/src/modules/pos/hardware.service.ts`)

Manages USB HID device registration and print queue.

**Key Methods:**
- `registerHardwareDevice()`: Pair device (vendor ID + product ID)
- `listHardwareDevices()`: Get active devices
- `updateHardwareDevice()`: Reconfigure device
- `queuePrintJob()`: Add receipt/label to print queue
- `getPrintQueue()`: Get queued jobs for processing
- `updatePrintJobStatus()`: Track printing completion

---

## Frontend Components

### Device Serials Management (`apps/admin-web/app/devices/device-serials-list.tsx`)

React component displaying device serial inventory.

**Features:**
- List all device serials with real-time search
- Display serial number, IMEI, model, status, batch code
- Color-coded status badges (in_stock, sold, damaged, etc.)
- Warranty link indicator
- Batch actions (view batch, mark as damaged)

### Warranty Claims Dashboard (`apps/admin-web/app/warranty/warranty-claims-dashboard.tsx`)

React component for managing warranty claims.

**Features:**
- Tab-based filtering (submitted, approved, rejected, all)
- Display claims with reference number and device info
- Inline claim approval/rejection with modal
- Admin notes and decision history
- Status indicators

### POS Hardware Configuration (`apps/admin-web/app/settings/pos-hardware-config.tsx`)

React component for managing connected hardware devices.

**Features:**
- Register new USB devices (enter vendor ID, product ID)
- List all configured devices with status
- Enable/disable devices
- View device configuration (protocol, interface)
- Remove devices

---

## Hardware Integration (Client-Side)

### USB HID Utilities (`apps/admin-web/lib/hardware/usb-hid.ts`)

TypeScript utilities for WebUSB API and device communication.

#### Key Classes

**`TSPLPrinter`** - Thermal Printer Control
```typescript
const printer = new TSPLPrinter(usbDevice);
printer
  .pageSize(80, 100)
  .text(50, 50, 'A', 'Receipt')
  .barcode(50, 100, '123456789', 'CODE128')
  .print(1)
  .send();
```

**`BarcodeScanner`** - USB HID Keyboard Wedge
```typescript
const scanner = new BarcodeScanner();
scanner.startListening();
scanner.onScan((barcode) => {
  console.log('Scanned:', barcode);
  lookupProduct(barcode);
});
```

**`CashDrawer`** - Drawer Control
```typescript
const drawer = new CashDrawer(usbDevice);
await drawer.open();
```

#### WebUSB Support
```typescript
// Check support
if (isWebUSBSupported()) {
  // Request device
  const device = await requestUSBDevice();
  await connectUSBDevice(device);
  await sendUSBCommand(device, command);
  await disconnectUSBDevice(device);
}
```

---

## Hooks

### `useDeviceSerials` (`apps/admin-web/hooks/useDeviceSerials.ts`)

React hook for device serial management.

```typescript
const { 
  serials, 
  isLoading, 
  error,
  fetchSerials,
  createSerial,
  bulkImportSerials,
  updateSerialStatus
} = useDeviceSerials({ storeId });

// Fetch with filters
await fetchSerials({ 
  status: 'in_stock',
  skuId: 'some-sku',
  limit: 100
});

// Create single serial
const serial = await createSerial({
  skuId: 'sku-123',
  serialNumber: 'SN-2024-001',
  imeiNumber: '358474081234567',
  deviceModel: 'iPhone 15 Pro',
  batchCode: 'BATCH-2024-Q1',
  color: 'Space Black'
});

// Bulk import from CSV
const result = await bulkImportSerials([
  { serialNumber: 'SN-001', deviceModel: 'iPhone 15', skuId: '...', ... },
  // ... more serials
]);
// Returns: { imported: 99, failed: 1, errors: [...] }

// Update status on sale
await updateSerialStatus(serialId, 'sold', saleId);
```

### `useWarranty` (`apps/admin-web/hooks/useWarranty.ts`)

React hook for warranty management.

```typescript
const {
  claims,
  policies,
  isLoading,
  error,
  fetchClaims,
  submitClaim,
  resolveClaim,
  createPolicy
} = useWarranty({ storeId });

// Fetch pending claims
await fetchClaims({ status: 'submitted' });

// Submit claim
const claim = await submitClaim({
  saleWarrantyId: 'warranty-123',
  deviceSerialId: 'serial-456',
  claimType: 'device_not_working',
  issueDescription: 'Screen is cracked',
  issueDate: new Date()
});

// Approve claim
await resolveClaim(claimId, {
  status: 'approved',
  resolutionType: 'device_replacement',
  replacementSerialId: 'serial-789',
  approvalNotes: 'Approved for replacement unit'
});

// Create policy
const policy = await createPolicy({
  code: 'EXTENDED_12M',
  name: '12-Month Extended Warranty',
  warrantyType: 'extended',
  durationMonths: 12,
  coverageScope: 'accidental_damage',
  termsText: '...'
});
```

---

## Business Logic & Validation Rules

### Serial-Tracked Products (Tech Categories)

1. **Creation:**
   - Serial MUST be unique per store
   - IMEI MANDATORY for mobile_phones category
   - Cannot duplicate serial within store

2. **Inventory Movement:**
   - Cannot deduct from inventory without serial assignment
   - Status changes tracked in ledger
   - Location changes tracked

3. **Sale Workflow:**
   - Serial status: `in_stock` → `sold`
   - `assigned_to_sale_id` set immutably (cannot change)
   - Warranty auto-created if category has `requires_warranty: true`

### Warranty Rules

1. **Creation:**
   - Auto-created on tech product sale
   - Warranty start_date = sale date
   - Warranty end_date = sale date + policy.duration_months
   - Cannot be modified after sale

2. **Claims:**
   - Only valid during active warranty period
   - If warranty expired, claim rejected automatically
   - Device serial must match sale_warranty.device_serial_id
   - One warranty per device per sale

3. **Approval:**
   - Admin reviews and approves/rejects
   - If replacement: new serial linked to old serial's claim
   - If refund: customer receives refund amount
   - If store_credit: credit added to customer account

### Batch Operations

1. **Creation:**
   - Batch code immutable after creation
   - Cannot receive serials without batch_code
   - Reconcile batch quantity with serial count before finalizing

2. **Lifecycle:**
   - `active`: Serials being sold
   - `quarantined`: Suspected defect, pending investigation
   - `recalled`: Defect confirmed, all devices flagged
   - `depleted`: All serials sold/removed

3. **Recall Management:**
   - Can recall entire batch with reason
   - All serials in batch get recall alert
   - Customer notifications triggered
   - Extended warranty offered

---

## Implementation Status

### Completed (Phase 1-2)

✅ Database migrations
✅ Type definitions (`@mvp/types`)
✅ Device serials service & API
✅ Warranty service & API
✅ POS hardware service & API
✅ USB HID utilities (WebUSB, TSPL, barcode scanner)
✅ Admin components (serials list, claims dashboard, hardware config)
✅ React hooks (useDeviceSerials, useWarranty)

### To Do (Phase 3-7)

⏳ Phase 3: Inventory Integration - Stock ledger updates, batch management
⏳ Phase 4: POS & Sales Integration - Checkout flow, receipt printing
⏳ Phase 5: Admin Dashboard - Analytics, reporting, alerts
⏳ Phase 6: Advanced Features - Warranty renewal, specs DB, device history

---

## Deployment Checklist

Before deploying, ensure:

- [ ] Database migrations applied (`db:migrate`)
- [ ] Environment variables configured (database connection)
- [ ] API routes registered in module exports
- [ ] Frontend components imported in page layouts
- [ ] WebUSB support verified in target browsers (Chromium-based)
- [ ] Test device serials and warranty claims workflows
- [ ] Verify hardware device pairing workflow

---

## Browser Compatibility

- **WebUSB API:** Chromium 61+, Edge 79+, Opera 48+
- **Not supported:** Firefox, Safari (at time of writing)
- **Fallback:** Manual print queue for unsupported browsers

---

## Related Documentation

- [DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md) - Complete schema reference
- [PRODUCT-VARIANT-DESIGN.md](./PRODUCT-VARIANT-DESIGN.md) - Product variant system
- [POS-PRINT-INTEGRATION.md](./POS-PRINT-INTEGRATION.md) - Printer integration details
