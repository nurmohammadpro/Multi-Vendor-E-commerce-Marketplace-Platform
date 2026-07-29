import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentAuthContext, CurrentAuthSession } from '../auth/current-auth.decorator.js';
import type { AuthSession, StoreAuthContext } from '../auth/auth.types.js';
import { RequireContext, RequirePermissions } from '../rbac/rbac.decorators.js';
import { PermissionsGuard } from '../rbac/permissions.guard.js';
import { StoreOpsService } from './store-ops.service.js';

const collectDuePaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(['cash', 'card', 'mfs', 'bank_transfer']),
  referenceNo: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

const supplierSchema = z.object({
  supplierType: z.enum(['supplier', 'importer', 'company']).default('supplier'),
  companyName: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().max(2000).optional(),
  note: z.string().max(1000).optional(),
  openingPayableAmount: z.number().nonnegative().default(0),
  status: z.enum(['active', 'inactive']).default('active'),
});

const supplierUpdateSchema = supplierSchema.partial().extend({
  contactName: z.string().max(200).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().max(2000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

const purchaseItemSchema = z.object({
  skuId: z.string().uuid(),
  qty: z.number().positive(),
  unitCost: z.number().nonnegative(),
  batchNo: z.string().max(120).optional(),
  expiryDate: z.string().date().optional(),
});

const createPurchaseSchema = z.object({
  supplierId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  purchaseDate: z.string().date(),
  invoiceNo: z.string().max(100).optional(),
  discountAmount: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  shippingAmount: z.number().nonnegative().default(0),
  note: z.string().max(1000).optional(),
  paymentMethod: z.enum(['cash', 'card', 'mfs', 'bank_transfer']).optional(),
  paidAmount: z.number().nonnegative().default(0),
  paymentReferenceNo: z.string().max(100).optional(),
  paymentNote: z.string().max(500).optional(),
  items: z.array(purchaseItemSchema).min(1),
});

const purchasePaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(['cash', 'card', 'mfs', 'bank_transfer']),
  referenceNo: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

const expenseSchema = z.object({
  expenseDate: z.string().date(),
  categoryName: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  amount: z.number().nonnegative(),
  paymentMethod: z.enum(['cash', 'card', 'mfs', 'bank_transfer']).default('cash'),
  note: z.string().max(500).optional(),
  status: z.enum(['draft', 'approved', 'void']).default('draft'),
});

const expenseUpdateSchema = expenseSchema.partial();

const ownerCashCountSchema = z.object({
  countedCashAmount: z.number().nonnegative(),
  note: z.string().max(500).optional(),
});

const employeeSchema = z.object({
  fullName: z.string().min(1).max(200),
  mobileNo: z.string().max(30).optional(),
  email: z.string().email().optional(),
  addressText: z.string().min(1).max(1000),
  roleCode: z.string().min(1).max(50),
  employmentStatus: z.enum(['active', 'inactive', 'terminated']).default('active'),
  joinDate: z.string().date(),
  employmentType: z.string().min(1).max(50).default('permanent'),
  designation: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  monthlySalary: z.number().nonnegative().default(0),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(30).optional(),
  salaryPaymentMode: z.enum(['cash', 'bank_transfer', 'mobile_banking']).optional(),
  bankName: z.string().max(150).optional(),
  bankAccountName: z.string().max(200).optional(),
  bankAccountNumber: z.string().max(80).optional(),
  mobileBankingType: z.string().max(50).optional(),
  mobileBankingNumber: z.string().max(30).optional(),
  educationSummary: z.string().max(3000).optional(),
  experienceSummary: z.string().max(3000).optional(),
  trainingSummary: z.string().max(3000).optional(),
  note: z.string().max(500).optional(),
});

const employeeUpdateSchema = employeeSchema.partial().extend({
  mobileNo: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  addressText: z.string().max(1000).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

const payrollRunSchema = z.object({
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  status: z.enum(['draft', 'approved', 'paid']).default('draft'),
  note: z.string().max(500).optional(),
  items: z.array(z.object({
    employeeId: z.string().uuid(),
    grossAmount: z.number().nonnegative(),
    bonusAmount: z.number().nonnegative().default(0),
    deductionAmount: z.number().nonnegative().default(0),
    note: z.string().max(500).optional(),
  })).min(1),
});

const payrollRunUpdateSchema = z.object({
  status: z.enum(['draft', 'approved', 'paid']).optional(),
  note: z.string().max(500).nullable().optional(),
});

const hardwareProfileSchema = z.object({
  bundlePreset: z.string().max(120).nullable().optional(),
  printerMode: z.enum(['pos_thermal', 'laser_a5']).optional().default('pos_thermal'),
  receiptPrinterModel: z.string().max(150).nullable().optional(),
  labelPrinterModel: z.string().max(150).nullable().optional(),
  barcodeScannerModel: z.string().max(150).nullable().optional(),
  cashDrawerModel: z.string().max(150).nullable().optional(),
  silentPrintingEnabled: z.boolean().optional(),
  printAgentAutostart: z.enum(['windows_task', 'mac_launchagent', 'manual']).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const bankAccountSchema = z.object({
  accountName: z.string().min(1).max(150),
  bankName: z.string().min(1).max(150),
  accountNumber: z.string().min(1).max(80),
  openingBalance: z.number().nonnegative().default(0),
  currentBalance: z.number().nonnegative().default(0),
  status: z.enum(['active', 'inactive']).default('active'),
  note: z.string().max(500).optional(),
});

const bankAccountUpdateSchema = bankAccountSchema.partial().extend({
  note: z.string().max(500).nullable().optional(),
});

const bankEntrySchema = z.object({
  bankAccountId: z.string().uuid(),
  entryDate: z.string().date(),
  entryType: z.enum(['credit', 'debit']),
  sourceType: z.enum(['sale', 'expense', 'deposit', 'adjustment']),
  referenceNo: z.string().max(100).optional(),
  amount: z.number().nonnegative(),
  status: z.enum(['pending', 'matched', 'flagged']).default('pending'),
  note: z.string().max(500).optional(),
});

const bankEntryUpdateSchema = bankEntrySchema.partial().extend({
  referenceNo: z.string().max(100).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});


// ── Quick Receive: create product + SKU + purchase + stock in one transaction ──

const quickReceiveSchema = z.object({
  productName: z.string().min(1).max(200),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  locationId: z.string().uuid(),
  salePrice: z.number().nonnegative(),
  purchaseQty: z.number().positive(),
  unitCost: z.number().nonnegative(),
  paidAmount: z.number().nonnegative().default(0),
  paymentMethod: z.enum(['cash','card','mfs','bank_transfer']).default('cash'),
  paymentReference: z.string().max(150).optional(),
  hasVariants: z.boolean().default(false),
  variantLabels: z.array(z.string().max(100)).optional(),
  variantPrices: z.array(z.number().nonnegative()).optional(),
  variantCosts: z.array(z.number().nonnegative()).optional(),
  isTrackable: z.boolean().default(true),
  note: z.string().max(500).optional(),
});

// ── Quick Exchange: create exchange/trade-in product ──

const quickExchangeSchema = z.object({
  productName: z.string().min(1).max(200),
  customerName: z.string().min(1).max(200),
  customerPhone: z.string().min(1).max(30),
  customerEmail: z.string().email().optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  salePrice: z.number().nonnegative(),
  unitCost: z.number().nonnegative().default(0),
  hasVariants: z.boolean().default(false),
  variantLabels: z.array(z.string().max(100)).optional(),
  variantPrices: z.array(z.number().nonnegative()).optional(),
  variantCosts: z.array(z.number().nonnegative()).optional(),
  isTrackable: z.boolean().default(false),
  note: z.string().max(500).optional(),
});


@Controller('store-ops')
@UseGuards(PermissionsGuard)
export class StoreOpsController {
  constructor(private readonly storeOpsService: StoreOpsService) {}

  @Get('customers')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listCustomers(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('query') query: string | undefined,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeOpsService.listCustomers(headerStoreId, authContext, {
      query,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('customers/:customerId')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getCustomer(
    @Param('customerId') customerId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.storeOpsService.getCustomer(customerId, headerStoreId, authContext);
  }

  @Get('due-sales')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listDueSales(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeOpsService.listDueSales(headerStoreId, authContext, {
      query,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('due-sales/aging')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getDueSalesAging(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.storeOpsService.getDueSalesAging(headerStoreId, authContext);
  }

  @Get('receivables/customer-ledger')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getCustomerLedger(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('customerId') customerId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.storeOpsService.getCustomerLedger(headerStoreId, authContext, {
      customerId,
      fromDate,
      toDate,
    });
  }

  @Get('owner-overview')
  @RequireContext('store')
  @RequirePermissions('inventory.adjust.approve')
  getOwnerOverview(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.storeOpsService.getOwnerOverview(headerStoreId, authContext);
  }

  @Post('owner-cash-count')
  @RequireContext('store')
  @RequirePermissions('inventory.adjust.approve')
  saveOwnerCashCount(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.saveOwnerCashCount(
      headerStoreId,
      authContext,
      session,
      ownerCashCountSchema.parse(payload),
    );
  }

  @Post('due-sales/:saleId/collections')
  @RequireContext('store')
  @RequirePermissions('sales.pos.create')
  collectDueSalePayment(
    @Param('saleId') saleId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.collectDueSalePayment(
      saleId,
      headerStoreId,
      authContext,
      session,
      collectDuePaymentSchema.parse(payload),
    );
  }

  @Get('suppliers')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listSuppliers(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeOpsService.listSuppliers(headerStoreId, authContext, {
      search,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('suppliers')
  @RequireContext('store')
  @RequirePermissions('procurement.manage')
  createSupplier(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.createSupplier(headerStoreId, authContext, session, supplierSchema.parse(payload));
  }

  @Patch('suppliers/:supplierId')
  @RequireContext('store')
  @RequirePermissions('procurement.manage')
  updateSupplier(
    @Param('supplierId') supplierId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.updateSupplier(supplierId, headerStoreId, authContext, supplierUpdateSchema.parse(payload));
  }

  @Get('purchases')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listPurchases(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeOpsService.listPurchases(headerStoreId, authContext, {
      search,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('purchases/:purchaseId')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getPurchase(
    @Param('purchaseId') purchaseId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.storeOpsService.getPurchase(purchaseId, headerStoreId, authContext);
  }

  @Post('quick-receive')
  @RequireContext('store')
  @RequirePermissions('procurement.manage')
  quickReceive(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.quickReceive(headerStoreId, authContext, session, quickReceiveSchema.parse(payload));
  }

  @Post('quick-exchange')
  @RequireContext('store')
  quickExchange(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.quickExchange(headerStoreId, authContext, session, quickExchangeSchema.parse(payload));
  }

  @Post('purchases')
  @RequireContext('store')
  @RequirePermissions('procurement.manage')
  createPurchase(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.createPurchase(headerStoreId, authContext, session, createPurchaseSchema.parse(payload));
  }

  @Post('purchases/:purchaseId/payments')
  @RequireContext('store')
  @RequirePermissions('finance.payables.manage')
  createPurchasePayment(
    @Param('purchaseId') purchaseId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.createPurchasePayment(
      purchaseId,
      headerStoreId,
      authContext,
      session,
      purchasePaymentSchema.parse(payload),
    );
  }

  @Get('payables')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listPayables(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.storeOpsService.listPayables(headerStoreId, authContext, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy,
      sortDir,
    });
  }

  @Get('payables/aging')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getPayablesAging(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.storeOpsService.getPayablesAging(headerStoreId, authContext);
  }

  @Get('payables/supplier-ledger')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  getSupplierLedger(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('supplierId') supplierId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.storeOpsService.getSupplierLedger(headerStoreId, authContext, {
      supplierId,
      fromDate,
      toDate,
    });
  }

  @Get('expenses')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  listExpenses(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeOpsService.listExpenses(headerStoreId, authContext, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('expenses')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  createExpense(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.createExpense(headerStoreId, authContext, session, expenseSchema.parse(payload));
  }

  @Patch('expenses/:expenseId')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  updateExpense(
    @Param('expenseId') expenseId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.updateExpense(expenseId, headerStoreId, authContext, expenseUpdateSchema.parse(payload));
  }

  @Get('payroll/employees')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listEmployees(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeOpsService.listEmployees(headerStoreId, authContext, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('payroll/employees')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  createEmployee(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.createEmployee(headerStoreId, authContext, session, employeeSchema.parse(payload));
  }

  @Patch('payroll/employees/:employeeId')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  updateEmployee(
    @Param('employeeId') employeeId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.updateEmployee(employeeId, headerStoreId, authContext, employeeUpdateSchema.parse(payload));
  }

  @Get('payroll/runs')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listPayrollRuns(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.storeOpsService.listPayrollRuns(headerStoreId, authContext, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      startDate,
      endDate,
    });
  }

  @Post('payroll/runs')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  createPayrollRun(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.createPayrollRun(headerStoreId, authContext, session, payrollRunSchema.parse(payload));
  }

  @Patch('payroll/runs/:payrollRunId')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  updatePayrollRun(
    @Param('payrollRunId') payrollRunId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.updatePayrollRun(payrollRunId, headerStoreId, authContext, payrollRunUpdateSchema.parse(payload));
  }

  @Get('hardware/profile')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  getHardwareProfile(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.storeOpsService.getHardwareProfile(headerStoreId, authContext);
  }

  @Patch('hardware/profile')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  updateHardwareProfile(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.updateHardwareProfile(headerStoreId, authContext, session, hardwareProfileSchema.parse(payload));
  }

  @Get('expense-categories')
  @RequireContext('store')
  @RequirePermissions('inventory.view')
  listExpenseCategories(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
  ) {
    return this.storeOpsService.listExpenseCategories(headerStoreId, authContext);
  }

  @Post('expense-categories')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  createExpenseCategory(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body('name') name: string,
  ) {
    return this.storeOpsService.createExpenseCategory(headerStoreId, authContext, { name });
  }

  @Patch('expense-categories/:categoryId')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  updateExpenseCategory(
    @Param('categoryId') categoryId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: { name?: string; status?: string },
  ) {
    return this.storeOpsService.updateExpenseCategory(categoryId, headerStoreId, authContext, payload);
  }

  @Get('banking/accounts')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listBankAccounts(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeOpsService.listBankAccounts(headerStoreId, authContext, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('banking/accounts')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  createBankAccount(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.createBankAccount(headerStoreId, authContext, session, bankAccountSchema.parse(payload));
  }

  @Patch('banking/accounts/:bankAccountId')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  updateBankAccount(
    @Param('bankAccountId') bankAccountId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.updateBankAccount(bankAccountId, headerStoreId, authContext, bankAccountUpdateSchema.parse(payload));
  }

  @Get('banking/entries')
  @RequireContext('store')
  @RequirePermissions('sales.report.view')
  listBankEntries(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeOpsService.listBankEntries(headerStoreId, authContext, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('banking/entries')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  createBankEntry(
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @CurrentAuthSession() session: AuthSession | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.createBankEntry(headerStoreId, authContext, session, bankEntrySchema.parse(payload));
  }

  @Patch('banking/entries/:entryId')
  @RequireContext('store')
  @RequirePermissions('store.settings.manage')
  updateBankEntry(
    @Param('entryId') entryId: string,
    @Headers('x-store-id') headerStoreId: string | undefined,
    @CurrentAuthContext() authContext: StoreAuthContext | null,
    @Body() payload: unknown,
  ) {
    return this.storeOpsService.updateBankEntry(entryId, headerStoreId, authContext, bankEntryUpdateSchema.parse(payload));
  }
}
