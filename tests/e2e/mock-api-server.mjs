import http from 'node:http';
import { URL } from 'node:url';

const PORT = 4010;

const TOKENS = {
  owner: 'e2e-owner-token',
  manager: 'e2e-manager-token',
  salesman: 'e2e-salesman-token',
};

const OWNER_PERMISSIONS = [
  'inventory.adjust.direct',
  'inventory.adjust.request',
  'inventory.adjust.approve',
  'inventory.view',
  'catalog.manage',
  'sales.pos.create',
  'sales.report.view',
  'store.settings.manage',
  'store.staff.manage',
  'billing.subscription.manage',
];

const MANAGER_PERMISSIONS = [
  'inventory.adjust.request',
  'inventory.view',
  'catalog.manage',
  'sales.pos.create',
  'sales.report.view',
];

const SALESMAN_PERMISSIONS = [
  'sales.pos.create',
];

const nowIso = () => new Date().toISOString();

const buildState = (scenario = 'default') => {
  const base = {
    counters: {
      category: 2,
      brand: 2,
      product: 2,
      group: 3,
      option: 5,
      sku: 2,
      customer: 0,
      stockRequest: 2,
      priceRequest: 2,
      ledger: 2,
      shift: 0,
      sale: 0,
      salePayment: 0,
      cashCount: 0,
      auditLog: 0,
    },
    store: {
      id: 'store_test',
      store_code: 'STORE001',
      name: 'Demo Store',
      name_bn: 'ডেমো স্টোর',
      logo_url: null,
      address_text: 'Dhaka, Bangladesh',
      slug: 'demo-store',
      phone: '+8801000000000',
      email: 'store@example.com',
      status: 'active',
      subscription_status: 'active',
    },
    settings: {
      store_id: 'store_test',
      timezone: 'Asia/Dhaka',
      currency_code: 'BDT',
      locale: 'en',
      receipt_footer: 'Thank you for shopping with us',
      invoice_prefix: 'INV',
      allow_negative_stock: false,
      low_stock_threshold_default: 5,
    },
    locations: [
      {
        id: 'loc-1',
        code: 'MAIN',
        name: 'Main Store',
        location_type: 'store',
        status: 'active',
      },
    ],
    registers: [
      {
        id: 'reg-1',
        code: 'REG-01',
        name: 'Front Counter',
        status: 'active',
        open_shift_id: null,
      },
    ],
    shifts: [],
    sales: [],
    salePayments: [],
    auditLogs: [],
    customers: [],
    categories: [
      { id: 'cat-1', code: 'APPAREL', name: 'Apparel', status: 'active', sort_order: 0 },
    ],
    brands: [
      { id: 'brand-1', name: 'Market One', status: 'active' },
    ],
    products: [
      {
        id: 'prod-1',
        product_code: 'TSHIRT',
        name: 'T-Shirt',
        description: 'Basic tee',
        status: 'active',
        has_variants: true,
        variant_mode: 'multi',
        category_id: 'cat-1',
        brand_id: 'brand-1',
      },
    ],
    variantGroups: [
      {
        id: 'group-1',
        product_id: 'prod-1',
        code: 'color',
        name: 'Color',
        input_type: 'text',
        sort_order: 0,
        is_required: true,
        status: 'active',
      },
      {
        id: 'group-2',
        product_id: 'prod-1',
        code: 'size',
        name: 'Size',
        input_type: 'text',
        sort_order: 1,
        is_required: true,
        status: 'active',
      },
    ],
    variantOptions: [
      {
        id: 'option-1',
        variant_group_id: 'group-1',
        code: 'BLK',
        label: 'Black',
        value_text: 'Black',
        value_number: null,
        color_hex: null,
        sort_order: 0,
        status: 'active',
      },
      {
        id: 'option-2',
        variant_group_id: 'group-2',
        code: 'M',
        label: 'M',
        value_text: 'M',
        value_number: null,
        color_hex: null,
        sort_order: 0,
        status: 'active',
      },
    ],
    skus: [
      {
        id: 'sku-1',
        product_id: 'prod-1',
        sku_code: 'TSHIRT-BLK-M',
        barcode: '1111111111111',
        variant_option_ids: ['option-1', 'option-2'],
        unit_name: 'pcs',
        weight_value: null,
        weight_unit: null,
        status: 'active',
        sale_price: 500,
        cost_price: 300,
        compare_at_price: 600,
      },
    ],
    balances: [
      {
        location_id: 'loc-1',
        sku_id: 'sku-1',
        on_hand_qty: 10,
        available_qty: 10,
        reserved_qty: 0,
        updated_at: nowIso(),
      },
    ],
    ledger: [
      {
        id: 'led-1',
        sku_id: 'sku-1',
        location_id: 'loc-1',
        movement_type: 'initialize',
        qty_delta: 10,
        note: 'Initial seed stock',
        actor_name: 'System',
        created_at: nowIso(),
      },
    ],
    stockRequests: [],
    priceRequests: [],
    ownerCashCount: null,
  };

  if (scenario === 'default') {
    base.stockRequests.push({
      id: 'adj-1',
      location_id: 'loc-1',
      sku_id: 'sku-1',
      current_qty: 10,
      requested_qty: 15,
      qty_delta: 5,
      reason: 'Manager counted extra stock',
      status: 'pending',
      requested_by_name: 'Store Manager',
      decision_note: null,
      created_at: nowIso(),
    });
    base.priceRequests.push({
      id: 'pcr-1',
      sku_id: 'sku-1',
      current_sale_price: 500,
      requested_sale_price: 550,
      current_cost_price: 300,
      requested_cost_price: 320,
      current_compare_at_price: 600,
      requested_compare_at_price: 650,
      reason: 'Supplier cost increased',
      status: 'pending',
      requested_by_name: 'Store Manager',
      decision_note: null,
      created_at: nowIso(),
    });
  }

  return base;
};

let state = buildState();

const send = (res, status, payload) => {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
};

const parseBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const getToken = (req) => {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
};

const getActor = (token) => {
  if (token === TOKENS.owner) {
    return {
      id: 'user-owner',
      email: 'owner@example.com',
      phone: '+8801000000001',
      name: 'Store Owner',
      roles: ['store_owner'],
      permissions: OWNER_PERMISSIONS,
    };
  }

  if (token === TOKENS.manager) {
    return {
      id: 'user-manager',
      email: 'manager@example.com',
      phone: '+8801000000002',
      name: 'Store Manager',
      roles: ['store_manager'],
      permissions: MANAGER_PERMISSIONS,
    };
  }

  if (token === TOKENS.salesman) {
    return {
      id: 'user-salesman',
      email: 'salesman@example.com',
      phone: '+8801000000003',
      name: 'Store Salesman',
      roles: ['store_salesman'],
      permissions: SALESMAN_PERMISSIONS,
    };
  }

  return null;
};

const requireActor = (req, res) => {
  const actor = getActor(getToken(req));
  if (!actor) {
    send(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return actor;
};

const requirePermission = (req, res, permission) => {
  const actor = requireActor(req, res);
  if (!actor) return null;
  if (!actor.permissions.includes(permission)) {
    send(res, 403, { error: 'Forbidden' });
    return null;
  }
  return actor;
};

const nextId = (key, prefix) => {
  state.counters[key] += 1;
  return `${prefix}-${state.counters[key]}`;
};

const getLocation = (locationId) => state.locations.find((location) => location.id === locationId) ?? null;
const getProduct = (productId) => state.products.find((product) => product.id === productId) ?? null;
const getSku = (skuId) => state.skus.find((sku) => sku.id === skuId) ?? null;
const getCustomer = (customerId) => state.customers.find((customer) => customer.id === customerId) ?? null;
const getBalance = (locationId, skuId) =>
  state.balances.find((balance) => balance.location_id === locationId && balance.sku_id === skuId) ?? null;
const getSalePayments = (saleId) => state.salePayments.filter((payment) => payment.sale_id === saleId);

const pushAuditLog = ({ actor, actionCode, resourceType, resourceId = null, after = null }) => {
  state.auditLogs.unshift({
    id: nextId('auditLog', 'audit'),
    actor_user_id: actor?.id ?? null,
    actor_type: actor ? 'user' : 'system',
    store_id: 'store_test',
    action_code: actionCode,
    resource_type: resourceType,
    resource_id: resourceId,
    before_json: null,
    after_json: after,
    created_at: nowIso(),
  });
};

const buildVariantLabel = (sku) => {
  const labels = (sku.variant_option_ids ?? [])
    .map((optionId) => {
      const option = state.variantOptions.find((entry) => entry.id === optionId);
      if (!option) return null;
      const group = state.variantGroups.find((entry) => entry.id === option.variant_group_id);
      if (!group) return null;
      return `${group.name}: ${option.label}`;
    })
    .filter(Boolean);
  return labels.length ? labels.join(' / ') : null;
};

const toSkuPayload = (sku) => {
  const product = getProduct(sku.product_id);
  const balance = state.balances.find((entry) => entry.sku_id === sku.id);
  return {
    id: sku.id,
    product_id: sku.product_id,
    sku_code: sku.sku_code,
    barcode: sku.barcode,
    variant_label: buildVariantLabel(sku),
    variant_json: null,
    status: sku.status,
    has_variants: product?.has_variants ?? false,
    variant_mode: product?.variant_mode ?? 'none',
    sale_price: sku.sale_price,
    cost_price: sku.cost_price,
    compare_at_price: sku.compare_at_price,
    available_qty: balance?.available_qty ?? 0,
    on_hand_qty: balance?.on_hand_qty ?? 0,
    product_name: product?.name ?? 'Unknown product',
  };
};

const toProductSummary = (product) => {
  const category = state.categories.find((entry) => entry.id === product.category_id);
  const brand = state.brands.find((entry) => entry.id === product.brand_id);
  const skuCount = state.skus.filter((sku) => sku.product_id === product.id).length;
  return {
    id: product.id,
    product_code: product.product_code,
    name: product.name,
    status: product.status,
    has_variants: product.has_variants,
    variant_mode: product.variant_mode,
    category_name: category?.name ?? null,
    brand_name: brand?.name ?? null,
    sku_count: skuCount,
  };
};

const buildProductDetail = (productId) => {
  const product = getProduct(productId);
  if (!product) return null;
  const groups = state.variantGroups
    .filter((group) => group.product_id === productId)
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((group) => ({
      id: group.id,
      code: group.code,
      name: group.name,
      input_type: group.input_type,
      sort_order: group.sort_order,
      is_required: group.is_required,
      status: group.status,
      options: state.variantOptions
        .filter((option) => option.variant_group_id === group.id)
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((option) => ({
          id: option.id,
          code: option.code,
          label: option.label,
          valueText: option.value_text,
          valueNumber: option.value_number,
          colorHex: option.color_hex,
          sortOrder: option.sort_order,
          status: option.status,
        })),
    }));

  return {
    product: {
      id: product.id,
      product_code: product.product_code,
      name: product.name,
      description: product.description,
      status: product.status,
      has_variants: product.has_variants,
      variant_mode: product.variant_mode,
      category_id: product.category_id,
      brand_id: product.brand_id,
    },
    groups,
    skus: state.skus.filter((sku) => sku.product_id === productId).map((sku) => toSkuPayload(sku)),
  };
};

const buildInventoryBalancePayload = (locationId) =>
  state.balances
    .filter((balance) => !locationId || balance.location_id === locationId)
    .map((balance) => {
      const sku = getSku(balance.sku_id);
      const product = sku ? getProduct(sku.product_id) : null;
      const location = getLocation(balance.location_id);
      return {
        location_id: balance.location_id,
        location_name: location?.name ?? 'Unknown location',
        sku_id: balance.sku_id,
        sku_code: sku?.sku_code ?? 'UNKNOWN',
        product_name: product?.name ?? 'Unknown product',
        on_hand_qty: balance.on_hand_qty,
        available_qty: balance.available_qty,
        reserved_qty: balance.reserved_qty,
        updated_at: balance.updated_at,
      };
    });

const buildAdjustmentPayload = (request) => {
  const sku = getSku(request.sku_id);
  const product = sku ? getProduct(sku.product_id) : null;
  const location = getLocation(request.location_id);
  return {
    id: request.id,
    location_id: request.location_id,
    location_name: location?.name ?? 'Unknown location',
    sku_id: request.sku_id,
    sku_code: sku?.sku_code ?? 'UNKNOWN',
    product_name: product?.name ?? 'Unknown product',
    current_qty: request.current_qty,
    requested_qty: request.requested_qty,
    qty_delta: request.qty_delta,
    reason: request.reason,
    status: request.status,
    requested_by_name: request.requested_by_name,
    decision_note: request.decision_note ?? null,
    created_at: request.created_at,
  };
};

const buildPriceRequestPayload = (request) => {
  const sku = getSku(request.sku_id);
  const product = sku ? getProduct(sku.product_id) : null;
  return {
    id: request.id,
    sku_id: request.sku_id,
    sku_code: sku?.sku_code ?? 'UNKNOWN',
    product_name: product?.name ?? 'Unknown product',
    variant_label: sku ? buildVariantLabel(sku) : null,
    current_sale_price: request.current_sale_price,
    requested_sale_price: request.requested_sale_price,
    current_cost_price: request.current_cost_price,
    requested_cost_price: request.requested_cost_price,
    current_compare_at_price: request.current_compare_at_price,
    requested_compare_at_price: request.requested_compare_at_price,
    reason: request.reason,
    status: request.status,
    requested_by_name: request.requested_by_name,
    decision_note: request.decision_note ?? null,
    created_at: request.created_at,
  };
};

const getPaidAmount = (saleId) =>
  getSalePayments(saleId)
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

const getOutstandingAmount = (sale) => Math.max(Number(sale.total_amount ?? 0) - getPaidAmount(sale.id), 0);

const getComputedPaymentStatus = (sale) => {
  const paidAmount = getPaidAmount(sale.id);
  const totalAmount = Number(sale.total_amount ?? 0);
  if (paidAmount <= 0) return 'due';
  if (paidAmount >= totalAmount) return 'paid';
  return 'partial';
};

const resolveCustomer = (sale) => {
  if (!sale.customer_id) return null;
  return getCustomer(sale.customer_id);
};

const upsertCustomerFromSale = (sale) => {
  const hasIdentity = [sale.customer_phone, sale.customer_email, sale.customer_name, sale.customer_shop_name].some(
    (value) => Boolean(String(value ?? '').trim()),
  );
  if (!hasIdentity) return null;

  const normalizedPhone = String(sale.customer_phone ?? '').trim();
  const normalizedEmail = String(sale.customer_email ?? '').trim().toLowerCase();

  let customer =
    state.customers.find((entry) => normalizedPhone && entry.mobile_no === normalizedPhone) ??
    state.customers.find((entry) => normalizedEmail && String(entry.email ?? '').toLowerCase() === normalizedEmail) ??
    null;

  if (!customer) {
    customer = {
      id: nextId('customer', 'cust'),
      full_name: sale.customer_name ?? null,
      mobile_no: sale.customer_phone ?? null,
      email: sale.customer_email ?? null,
      shop_name: sale.customer_shop_name ?? null,
      address: sale.customer_address ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.customers.unshift(customer);
  } else {
    customer.full_name = sale.customer_name ?? customer.full_name ?? null;
    customer.mobile_no = sale.customer_phone ?? customer.mobile_no ?? null;
    customer.email = sale.customer_email ?? customer.email ?? null;
    customer.shop_name = sale.customer_shop_name ?? customer.shop_name ?? null;
    customer.address = sale.customer_address ?? customer.address ?? null;
    customer.updated_at = nowIso();
  }

  sale.customer_id = customer.id;
  return customer;
};

const formatDateOnly = (value) => new Date(value).toISOString().slice(0, 10);

const diffDays = (fromDate, toDate = new Date()) => {
  const from = new Date(fromDate);
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const target = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()));
  const days = Math.floor((target.getTime() - start.getTime()) / 86400000);
  return Math.max(days, 0);
};

const buildCustomerSummary = (customer) => {
  const customerSales = state.sales.filter((sale) => sale.customer_id === customer.id);
  const outstandingDueAmount = customerSales.reduce((sum, sale) => {
    const status = getComputedPaymentStatus(sale);
    return sum + (status === 'paid' ? 0 : getOutstandingAmount(sale));
  }, 0);

  return {
    ...customer,
    total_sales_count: customerSales.length,
    outstanding_due_amount: outstandingDueAmount,
  };
};

const buildCustomerDueSale = (sale) => ({
  id: sale.id,
  sale_no: sale.sale_no,
  total_amount: sale.total_amount,
  payment_status: getComputedPaymentStatus(sale),
  due_date: sale.due_date ?? null,
  created_at: sale.created_at,
  outstanding_due_amount: getOutstandingAmount(sale),
});

const buildSalesReportPayload = () => {
  const recentSales = state.sales
    .slice()
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .map((sale) => ({
      sale_no: sale.sale_no,
      total_amount: sale.total_amount,
      payment_status: getComputedPaymentStatus(sale),
      fulfillment_status: 'completed',
      customer_name: sale.customer_name ?? null,
      customer_phone: sale.customer_phone ?? null,
      customer_email: sale.customer_email ?? null,
      customer_shop_name: sale.customer_shop_name ?? null,
      customer_address: sale.customer_address ?? null,
      due_date: sale.due_date ?? null,
      created_at: sale.created_at,
    }));

  const dueSales = recentSales
    .filter((sale) => sale.payment_status === 'due' || sale.payment_status === 'partial')
    .map((sale) => {
      const fullSale = state.sales.find((entry) => entry.sale_no === sale.sale_no);
      return {
        ...sale,
        total_amount: fullSale ? getOutstandingAmount(fullSale) : sale.total_amount,
      };
    });

  return {
    summary: {
      total_sales_amount: state.sales.reduce((sum, sale) => sum + Number(sale.total_amount ?? 0), 0),
      total_orders_count: state.sales.length,
      total_discount_amount: 0,
      total_tax_amount: 0,
      due_sales_count: dueSales.length,
      due_sales_amount: dueSales.reduce((sum, sale) => sum + Number(sale.total_amount ?? 0), 0),
    },
    recentSales: recentSales.slice(0, 12),
    dueSales,
  };
};

const buildDueAgingPayload = () => {
  const buckets = {
    today_amount: 0,
    today_count: 0,
    days_7_amount: 0,
    days_7_count: 0,
    days_30_amount: 0,
    days_30_count: 0,
    days_90_amount: 0,
    days_90_count: 0,
    days_90_plus_amount: 0,
    days_90_plus_count: 0,
  };

  for (const sale of state.sales) {
    const paymentStatus = getComputedPaymentStatus(sale);
    if (paymentStatus === 'paid') continue;
    const outstanding = getOutstandingAmount(sale);
    const agingDays = diffDays(sale.due_date ?? formatDateOnly(sale.created_at));

    if (agingDays === 0) {
      buckets.today_amount += outstanding;
      buckets.today_count += 1;
    } else if (agingDays <= 7) {
      buckets.days_7_amount += outstanding;
      buckets.days_7_count += 1;
    } else if (agingDays <= 30) {
      buckets.days_30_amount += outstanding;
      buckets.days_30_count += 1;
    } else if (agingDays <= 90) {
      buckets.days_90_amount += outstanding;
      buckets.days_90_count += 1;
    } else {
      buckets.days_90_plus_amount += outstanding;
      buckets.days_90_plus_count += 1;
    }
  }

  return buckets;
};

const buildOwnerOverviewPayload = () => {
  const today = formatDateOnly(nowIso());
  const todayDuePayments = state.salePayments.filter((payment) => {
    if (payment.status !== 'paid' || !payment.paid_at) return false;
    const sale = state.sales.find((entry) => entry.id === payment.sale_id);
    return Boolean(sale?.due_date) && formatDateOnly(payment.paid_at) === today;
  });
  const todayCashSalesAmount = state.salePayments.reduce((sum, payment) => {
    if (payment.status !== 'paid' || payment.payment_method !== 'cash' || !payment.paid_at) return sum;
    const sale = state.sales.find((entry) => entry.id === payment.sale_id);
    if (!sale?.id || sale.due_date) return sum;
    return formatDateOnly(payment.paid_at) === today ? sum + Number(payment.amount ?? 0) : sum;
  }, 0);
  const todayCashDueCollectionsAmount = todayDuePayments.reduce((sum, payment) => (
    payment.payment_method === 'cash' ? sum + Number(payment.amount ?? 0) : sum
  ), 0);
  const todayCashExpenseAmount = 0;
  const expectedCashAmount = todayCashSalesAmount + todayCashDueCollectionsAmount - todayCashExpenseAmount;
  const countedCashAmount = state.ownerCashCount?.counted_cash_amount ?? null;

  return {
    pendingStockApprovals: state.stockRequests.filter((request) => request.status === 'pending').length,
    pendingPriceApprovals: state.priceRequests.filter((request) => request.status === 'pending').length,
    totalPendingApprovals:
      state.stockRequests.filter((request) => request.status === 'pending').length
      + state.priceRequests.filter((request) => request.status === 'pending').length,
    todayDueCollectionsAmount: todayDuePayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
    todayDueCollectionsCount: todayDuePayments.length,
    todayCashSalesAmount,
    todayCashDueCollectionsAmount,
    todayCashExpenseAmount,
    expectedCashAmount,
    countedCashAmount,
    cashVarianceAmount: countedCashAmount === null ? expectedCashAmount : Number(countedCashAmount) - expectedCashAmount,
    cashCountNote: state.ownerCashCount?.note ?? null,
    cashCountUpdatedAt: state.ownerCashCount?.updated_at ?? null,
    recentCashCounts: state.ownerCashCount ? [{
      countDate: state.ownerCashCount.count_date,
      countedCashAmount: Number(state.ownerCashCount.counted_cash_amount ?? 0),
      expectedCashAmount: Number(state.ownerCashCount.expected_cash_amount ?? 0),
      varianceAmount: Number(state.ownerCashCount.variance_amount ?? 0),
      note: state.ownerCashCount.note ?? null,
      updatedAt: state.ownerCashCount.updated_at,
    }] : [],
  };
};

const buildReceiptPayload = (sale) => {
  const location = getLocation(sale.location_id);
  const paidAmount = getPaidAmount(sale.id);
  const dueAmount = getOutstandingAmount(sale);
  const payments = getSalePayments(sale.id);

  return {
    saleId: sale.id,
    saleNo: sale.sale_no,
    printedAt: sale.created_at,
    store: {
      name: state.store.name,
      logoUrl: state.store.logo_url,
      phone: state.store.phone,
      email: state.store.email,
      address: state.store.address_text,
      footer: state.settings.receipt_footer ?? '',
    },
    customer: {
      name: sale.customer_name ?? null,
      phone: sale.customer_phone ?? null,
      email: sale.customer_email ?? null,
      shopName: sale.customer_shop_name ?? null,
      address: sale.customer_address ?? null,
    },
    items: sale.items.map((item) => ({
      name: `${item.product_name}${item.variant_label ? ` · ${item.variant_label}` : ''}`,
      skuCode: item.sku_code,
      qty: item.qty,
      unitPrice: item.unit_price,
      lineTotal: item.total_amount,
    })),
    totals: {
      subtotal: sale.total_amount,
      discount: 0,
      tax: 0,
      shipping: 0,
      total: sale.total_amount,
      paid: paidAmount,
      due: dueAmount,
      change: 0,
    },
    payments: payments.map((payment) => ({
      paymentMethod: payment.payment_method,
      amount: payment.amount,
      status: payment.status,
    })),
    meta: {
      locationName: location?.name ?? 'Main Store',
      dueDate: sale.due_date ?? null,
      invoicePrefix: state.settings.invoice_prefix ?? 'INV',
    },
  };
};

const appendLedger = ({ skuId, locationId, movementType, qtyDelta, note, actorName }) => {
  state.ledger.unshift({
    id: nextId('ledger', 'led'),
    sku_id: skuId,
    location_id: locationId,
    movement_type: movementType,
    qty_delta: qtyDelta,
    note: note ?? null,
    actor_name: actorName,
    created_at: nowIso(),
  });
};

const upsertBalance = ({ skuId, locationId, finalQty }) => {
  const existing = getBalance(locationId, skuId);
  const nextBalance = {
    location_id: locationId,
    sku_id: skuId,
    on_hand_qty: finalQty,
    available_qty: finalQty,
    reserved_qty: existing?.reserved_qty ?? 0,
    updated_at: nowIso(),
  };

  if (existing) {
    Object.assign(existing, nextBalance);
    return existing;
  }

  state.balances.push(nextBalance);
  return nextBalance;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (url.pathname === '/reset' && req.method === 'POST') {
    const body = await parseBody(req).catch(() => ({}));
    state = buildState(body?.scenario === 'blank' ? 'blank' : 'default');
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/v1/auth/login' && req.method === 'POST') {
    const body = await parseBody(req);
    if ((body.email === 'owner@example.com' || body.phone === '+8801000000001') && body.password === 'ChangeMe-Store-123!') {
      return send(res, 200, {
        tokenType: 'Bearer',
        accessToken: TOKENS.owner,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        user: { id: 'user-owner', tenantId: 'tenant-1', email: 'owner@example.com', phone: '+8801000000001', preferredLocale: 'en' },
        contexts: [{ type: 'store', storeId: 'store_test', roles: ['store_owner'] }],
      });
    }
    if ((body.email === 'manager@example.com' || body.phone === '+8801000000002') && body.password === 'ChangeMe-Store-123!') {
      return send(res, 200, {
        tokenType: 'Bearer',
        accessToken: TOKENS.manager,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        user: { id: 'user-manager', tenantId: 'tenant-1', email: 'manager@example.com', phone: '+8801000000002', preferredLocale: 'en' },
        contexts: [{ type: 'store', storeId: 'store_test', roles: ['store_manager'] }],
      });
    }
    if ((body.email === 'salesman@example.com' || body.phone === '+8801000000003') && body.password === 'ChangeMe-Store-123!') {
      return send(res, 200, {
        tokenType: 'Bearer',
        accessToken: TOKENS.salesman,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        user: { id: 'user-salesman', tenantId: 'tenant-1', email: 'salesman@example.com', phone: '+8801000000003', preferredLocale: 'en' },
        contexts: [{ type: 'store', storeId: 'store_test', roles: ['store_salesman'] }],
      });
    }
    return send(res, 401, { message: 'Invalid credentials' });
  }

  if (url.pathname === '/v1/auth/contexts' && req.method === 'GET') {
    const actor = requireActor(req, res);
    if (!actor) return;
    return send(res, 200, { contexts: [{ type: 'store', storeId: 'store_test', roles: actor.roles }] });
  }

  if (url.pathname === '/v1/auth/select-context' && req.method === 'POST') {
    const actor = requireActor(req, res);
    if (!actor) return;
    return send(res, 200, { activeContext: { type: 'store', storeId: 'store_test', roles: actor.roles } });
  }

  if (url.pathname === '/v1/auth/me' && req.method === 'GET') {
    const actor = requireActor(req, res);
    if (!actor) return;
    return send(res, 200, {
      user: {
        id: actor.id,
        email: actor.email,
        phone: actor.phone,
        preferredLocale: 'en',
        status: 'active',
      },
      contexts: [
        {
          type: 'store',
          storeId: 'store_test',
          storeName: state.store.name,
          roles: actor.roles,
          permissions: actor.permissions,
        },
      ],
      permissions: actor.permissions,
      session: {
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
  }

  if (url.pathname === '/v1/auth/logout' && req.method === 'POST') {
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/v1/billing/subscription/summary' && req.method === 'GET') {
    const actor = requirePermission(req, res, 'inventory.view');
    if (!actor) return;
    return send(res, 200, { subscription: { plan_code: 'pro', plan_name: 'Pro', status: 'active' } });
  }

  if (url.pathname === '/v1/audit/store-logs' && req.method === 'GET') {
    const actor = requirePermission(req, res, 'sales.report.view');
    if (!actor) return;
    const search = String(url.searchParams.get('search') ?? '').trim().toLowerCase();
    const actionCode = String(url.searchParams.get('actionCode') ?? '').trim();
    const resourceType = String(url.searchParams.get('resourceType') ?? '').trim();
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '20') || 20));
    const filtered = state.auditLogs.filter((entry) =>
      (!actionCode || entry.action_code === actionCode)
      && (!resourceType || entry.resource_type === resourceType)
      && (
        !search
        || entry.action_code.toLowerCase().includes(search)
        || entry.resource_type.toLowerCase().includes(search)
        || String(entry.resource_id ?? '').toLowerCase().includes(search)
      )
    );
    const start = (page - 1) * limit;
    return send(res, 200, {
      logs: filtered.slice(start, start + limit),
      pagination: { page, limit, total: filtered.length },
    });
  }

  if (url.pathname === '/v1/reports/store/sales' && req.method === 'GET') {
    return send(res, 200, buildSalesReportPayload());
  }

  if (url.pathname === '/v1/reports/store/inventory' && req.method === 'GET') {
    return send(res, 200, {
      summary: {
        total_available_qty: state.balances.reduce((sum, item) => sum + Number(item.available_qty || 0), 0),
        sku_count: state.skus.length,
        total_on_hand_qty: state.balances.reduce((sum, item) => sum + Number(item.on_hand_qty || 0), 0),
      },
      balances: buildInventoryBalancePayload(),
    });
  }

  if (url.pathname === '/v1/store-ops/owner-overview' && req.method === 'GET') {
    return send(res, 200, { overview: buildOwnerOverviewPayload() });
  }

  if (url.pathname === '/v1/store-ops/owner-cash-count' && req.method === 'POST') {
    const actor = requirePermission(req, res, 'inventory.adjust.approve');
    if (!actor) return;
    const body = await parseBody(req);
    const overview = buildOwnerOverviewPayload();
    state.ownerCashCount = {
      id: nextId('cashCount', 'cash-count'),
      count_date: formatDateOnly(nowIso()),
      counted_cash_amount: Number(body.countedCashAmount ?? 0),
      expected_cash_amount: Number(overview.expectedCashAmount ?? 0),
      variance_amount: Number(body.countedCashAmount ?? 0) - Number(overview.expectedCashAmount ?? 0),
      note: body.note ?? null,
      updated_at: nowIso(),
    };
    pushAuditLog({
      actor,
      actionCode: 'owner.cash_count.save',
      resourceType: 'cash_count',
      resourceId: state.ownerCashCount.id,
      after: state.ownerCashCount,
    });
    return send(res, 200, { overview: buildOwnerOverviewPayload() });
  }

  if (url.pathname === '/v1/stores/store_test' && req.method === 'GET') {
    return send(res, 200, { store: state.store });
  }

  if (url.pathname === '/v1/stores/store_test' && req.method === 'PATCH') {
    const actor = requirePermission(req, res, 'store.settings.manage');
    if (!actor) return;
    const body = await parseBody(req);
    state.store = {
      ...state.store,
      name: body.name ?? state.store.name,
      name_bn: body.nameBn ?? state.store.name_bn,
      phone: body.phone ?? state.store.phone,
      email: body.email ?? state.store.email,
      address_text: body.address ?? state.store.address_text,
      logo_url: body.logoUrl ?? state.store.logo_url,
    };
    pushAuditLog({
      actor,
      actionCode: 'store.profile.update',
      resourceType: 'store',
      resourceId: state.store.id,
      after: state.store,
    });
    return send(res, 200, { store: state.store });
  }

  if (url.pathname === '/v1/stores/store_test/settings' && req.method === 'GET') {
    return send(res, 200, { settings: state.settings });
  }

  if (url.pathname === '/v1/stores/store_test/settings' && req.method === 'PATCH') {
    const actor = requirePermission(req, res, 'store.settings.manage');
    if (!actor) return;
    const body = await parseBody(req);
    state.settings = {
      ...state.settings,
      timezone: body.timezone ?? state.settings.timezone,
      currency_code: body.currencyCode ?? state.settings.currency_code,
      locale: body.locale ?? state.settings.locale,
      receipt_footer: body.receiptFooter ?? state.settings.receipt_footer,
      invoice_prefix: body.invoicePrefix ?? state.settings.invoice_prefix,
      allow_negative_stock: body.allowNegativeStock ?? state.settings.allow_negative_stock,
      low_stock_threshold_default: body.lowStockThresholdDefault ?? state.settings.low_stock_threshold_default,
    };
    pushAuditLog({
      actor,
      actionCode: 'store.settings.update',
      resourceType: 'store_settings',
      resourceId: state.settings.store_id,
      after: state.settings,
    });
    return send(res, 200, { settings: state.settings });
  }

  if (url.pathname === '/v1/catalog/categories' && req.method === 'GET') {
    return send(res, 200, { categories: state.categories });
  }

  if (url.pathname === '/v1/catalog/categories' && req.method === 'POST') {
    const actor = requirePermission(req, res, 'catalog.manage');
    if (!actor) return;
    const body = await parseBody(req);
    const category = {
      id: nextId('category', 'cat'),
      code: body.code,
      name: body.name,
      status: body.status ?? 'active',
      sort_order: body.sortOrder ?? 0,
    };
    pushAuditLog({
      actor,
      actionCode: 'catalog.category.create',
      resourceType: 'category',
      resourceId: category.id,
      after: category,
    });
    state.categories.push(category);
    return send(res, 201, { category });
  }

  if (url.pathname === '/v1/catalog/brands' && req.method === 'GET') {
    return send(res, 200, { brands: state.brands });
  }

  if (url.pathname === '/v1/catalog/brands' && req.method === 'POST') {
    const body = await parseBody(req);
    const brand = {
      id: nextId('brand', 'brand'),
      name: body.name,
      status: body.status ?? 'active',
    };
    state.brands.push(brand);
    return send(res, 201, { brand });
  }

  if (url.pathname === '/v1/catalog/products' && req.method === 'GET') {
    return send(res, 200, { products: state.products.map(toProductSummary) });
  }

  if (url.pathname === '/v1/catalog/products' && req.method === 'POST') {
    const body = await parseBody(req);
    const product = {
      id: nextId('product', 'prod'),
      product_code: body.productCode,
      name: body.name,
      description: body.description ?? null,
      status: body.status ?? 'active',
      has_variants: Boolean(body.hasVariants),
      variant_mode: body.variantMode ?? 'none',
      category_id: body.categoryId ?? null,
      brand_id: body.brandId ?? null,
    };
    state.products.push(product);
    return send(res, 201, { product });
  }

  if (/^\/v1\/catalog\/products\/[^/]+$/.test(url.pathname) && req.method === 'GET') {
    const productId = url.pathname.split('/').pop();
    const detail = buildProductDetail(productId);
    if (!detail) return send(res, 404, { error: 'Product not found' });
    return send(res, 200, detail);
  }

  if (/^\/v1\/catalog\/products\/[^/]+$/.test(url.pathname) && req.method === 'PATCH') {
    const productId = url.pathname.split('/').pop();
    const body = await parseBody(req);
    const product = getProduct(productId);
    if (!product) return send(res, 404, { error: 'Product not found' });
    Object.assign(product, {
      name: body.name ?? product.name,
      description: body.description ?? product.description,
      status: body.status ?? product.status,
      has_variants: body.hasVariants ?? product.has_variants,
      variant_mode: body.variantMode ?? product.variant_mode,
      category_id: body.categoryId ?? product.category_id,
      brand_id: body.brandId ?? product.brand_id,
    });
    return send(res, 200, buildProductDetail(productId));
  }

  if (/^\/v1\/catalog\/products\/[^/]+\/variant-groups$/.test(url.pathname) && req.method === 'POST') {
    const [, , , , productId] = url.pathname.split('/');
    const body = await parseBody(req);
    const group = {
      id: nextId('group', 'group'),
      product_id: productId,
      code: body.code,
      name: body.name,
      input_type: body.inputType ?? 'text',
      sort_order: body.sortOrder ?? 0,
      is_required: body.isRequired ?? true,
      status: body.status ?? 'active',
    };
    state.variantGroups.push(group);
    return send(res, 201, { group });
  }

  if (/^\/v1\/catalog\/products\/[^/]+\/variant-options$/.test(url.pathname) && req.method === 'POST') {
    const body = await parseBody(req);
    const option = {
      id: nextId('option', 'option'),
      variant_group_id: body.variantGroupId,
      code: body.code,
      label: body.label,
      value_text: body.valueText ?? null,
      value_number: body.valueNumber ?? null,
      color_hex: body.colorHex ?? null,
      sort_order: body.sortOrder ?? 0,
      status: body.status ?? 'active',
    };
    state.variantOptions.push(option);
    return send(res, 201, { option });
  }

  if (/^\/v1\/catalog\/products\/[^/]+\/variants$/.test(url.pathname) && req.method === 'GET') {
    const [, , , , productId] = url.pathname.split('/');
    return send(res, 200, { skus: state.skus.filter((sku) => sku.product_id === productId).map(toSkuPayload) });
  }

  if (url.pathname === '/v1/catalog/skus' && req.method === 'POST') {
    const body = await parseBody(req);
    const sku = {
      id: nextId('sku', 'sku'),
      product_id: body.productId,
      sku_code: body.skuCode,
      barcode: body.barcode ?? null,
      variant_option_ids: body.variantOptionIds ?? [],
      unit_name: body.unitName ?? null,
      weight_value: body.weightValue ?? null,
      weight_unit: body.weightUnit ?? null,
      status: body.status ?? 'active',
      sale_price: body.salePrice ?? null,
      cost_price: body.costPrice ?? null,
      compare_at_price: body.compareAtPrice ?? null,
    };
    state.skus.push(sku);
    return send(res, 201, { sku: toSkuPayload(sku) });
  }

  if (url.pathname === '/v1/catalog/skus/search' && req.method === 'GET') {
    const term = (url.searchParams.get('q') || '').toLowerCase();
    const barcode = (url.searchParams.get('barcode') || '').toLowerCase();
    const limit = Number(url.searchParams.get('limit') || 20);
    const skus = state.skus
      .filter((sku) => {
        const product = getProduct(sku.product_id);
        const variantLabel = buildVariantLabel(sku)?.toLowerCase() ?? '';
        const matchesQuery = !term
          || sku.sku_code.toLowerCase().includes(term)
          || (product?.name ?? '').toLowerCase().includes(term)
          || variantLabel.includes(term);
        const matchesBarcode = !barcode || (sku.barcode ?? '').toLowerCase().includes(barcode);
        return matchesQuery && matchesBarcode;
      })
      .slice(0, limit)
      .map(toSkuPayload);
    return send(res, 200, { skus });
  }

  if (url.pathname === '/v1/catalog/prices' && req.method === 'POST') {
    const body = await parseBody(req);
    const sku = getSku(body.skuId);
    if (!sku) return send(res, 404, { error: 'SKU not found' });
    sku.cost_price = body.costPrice ?? null;
    sku.sale_price = body.salePrice ?? sku.sale_price;
    sku.compare_at_price = body.compareAtPrice ?? null;
    return send(res, 200, { price: { sku_id: sku.id, sale_price: sku.sale_price } });
  }

  if (url.pathname === '/v1/catalog/price-change-requests' && req.method === 'GET') {
    const status = url.searchParams.get('status');
    return send(res, 200, {
      priceChangeRequests: state.priceRequests
        .filter((item) => !status || item.status === status)
        .map(buildPriceRequestPayload),
    });
  }

  if (url.pathname === '/v1/catalog/price-change-requests' && req.method === 'POST') {
    const actor = requireActor(req, res);
    if (!actor) return;
    const body = await parseBody(req);
    const sku = getSku(body.skuId);
    if (!sku) return send(res, 404, { error: 'SKU not found' });
    const request = {
      id: nextId('priceRequest', 'pcr'),
      sku_id: body.skuId,
      current_sale_price: sku.sale_price ?? null,
      requested_sale_price: body.salePrice,
      current_cost_price: sku.cost_price ?? null,
      requested_cost_price: body.costPrice ?? null,
      current_compare_at_price: sku.compare_at_price ?? null,
      requested_compare_at_price: body.compareAtPrice ?? null,
      reason: body.reason ?? '',
      status: 'pending',
      requested_by_name: actor.name,
      decision_note: null,
      created_at: nowIso(),
    };
    state.priceRequests.unshift(request);
    return send(res, 201, { priceChangeRequest: buildPriceRequestPayload(request) });
  }

  if (/^\/v1\/catalog\/price-change-requests\/[^/]+\/(approve|reject)$/.test(url.pathname) && req.method === 'POST') {
    const actor = requireActor(req, res);
    if (!actor) return;
    const body = await parseBody(req);
    const [, , , , requestId, decision] = url.pathname.split('/');
    const request = state.priceRequests.find((item) => item.id === requestId);
    if (!request) return send(res, 404, { error: 'Price request not found' });
    request.status = decision === 'approve' ? 'approved' : 'rejected';
    request.decision_note = body.decisionNote ?? null;
    if (decision === 'approve') {
      const sku = getSku(request.sku_id);
      if (sku) {
        sku.sale_price = request.requested_sale_price;
        sku.cost_price = request.requested_cost_price;
        sku.compare_at_price = request.requested_compare_at_price;
      }
    }
    return send(res, 200, { ok: true, decision });
  }

  if (url.pathname === '/v1/inventory/locations' && req.method === 'GET') {
    return send(res, 200, { locations: state.locations });
  }

  if (url.pathname === '/v1/pos/registers' && req.method === 'GET') {
    return send(res, 200, { registers: state.registers });
  }

  if (url.pathname === '/v1/pos/shifts/open' && req.method === 'POST') {
    const actor = requireActor(req, res);
    if (!actor) return;
    const body = await parseBody(req);
    const register = state.registers.find((entry) => entry.id === body.registerId);
    if (!register) return send(res, 404, { error: 'Register not found' });

    const shift = {
      id: nextId('shift', 'shift'),
      register_id: register.id,
      opening_cash: Number(body.openingCash ?? 0),
      closing_cash: null,
      status: 'open',
      opened_by_name: actor.name,
      opened_at: nowIso(),
      closed_at: null,
    };

    state.shifts.unshift(shift);
    register.open_shift_id = shift.id;
    return send(res, 200, { shift: { id: shift.id, status: shift.status } });
  }

  if (/^\/v1\/pos\/shifts\/[^/]+\/close$/.test(url.pathname) && req.method === 'POST') {
    const body = await parseBody(req);
    const [, , , shiftId] = url.pathname.split('/');
    const shift = state.shifts.find((entry) => entry.id === shiftId);
    if (!shift) return send(res, 404, { error: 'Shift not found' });

    shift.closing_cash = Number(body.closingCash ?? 0);
    shift.status = 'closed';
    shift.closed_at = nowIso();

    const register = state.registers.find((entry) => entry.id === shift.register_id);
    if (register) register.open_shift_id = null;

    return send(res, 200, { shift: { id: shift.id, status: shift.status } });
  }

  if (url.pathname === '/v1/pos/catalog/search' && req.method === 'GET') {
    const term = (url.searchParams.get('q') || '').toLowerCase();
    const barcode = (url.searchParams.get('barcode') || '').toLowerCase();
    const limit = Number(url.searchParams.get('limit') || 20);
    const skus = state.skus
      .filter((sku) => {
        const product = getProduct(sku.product_id);
        const variantLabel = buildVariantLabel(sku)?.toLowerCase() ?? '';
        const matchesQuery = !term
          || sku.sku_code.toLowerCase().includes(term)
          || (product?.name ?? '').toLowerCase().includes(term)
          || variantLabel.includes(term);
        const matchesBarcode = !barcode || (sku.barcode ?? '').toLowerCase().includes(barcode);
        return matchesQuery && matchesBarcode;
      })
      .slice(0, limit)
      .map(toSkuPayload);

    return send(res, 200, { skus });
  }

  if (url.pathname === '/v1/inventory/balances' && req.method === 'GET') {
    return send(res, 200, {
      balances: buildInventoryBalancePayload(url.searchParams.get('locationId')),
    });
  }

  if (url.pathname === '/v1/inventory/ledger' && req.method === 'GET') {
    const skuId = url.searchParams.get('skuId');
    const ledger = state.ledger
      .filter((entry) => !skuId || entry.sku_id === skuId)
      .map((entry) => {
        const sku = getSku(entry.sku_id);
        const product = sku ? getProduct(sku.product_id) : null;
        const location = getLocation(entry.location_id);
        return {
          id: entry.id,
          sku_id: entry.sku_id,
          sku_code: sku?.sku_code ?? 'UNKNOWN',
          product_name: product?.name ?? 'Unknown product',
          location_name: location?.name ?? 'Unknown location',
          movement_type: entry.movement_type,
          qty_delta: entry.qty_delta,
          note: entry.note ?? null,
          actor_name: entry.actor_name ?? null,
          created_at: entry.created_at,
        };
      });
    return send(res, 200, { ledger });
  }

  if (url.pathname === '/v1/inventory/initialize' && req.method === 'POST') {
    const actor = requireActor(req, res);
    if (!actor) return;
    const body = await parseBody(req);
    const sku = getSku(body.skuId);
    if (!sku) return send(res, 404, { error: 'SKU not found' });
    const finalQty = Number(body.quantity ?? 0);
    if (!Number.isFinite(finalQty)) return send(res, 400, { error: 'Quantity is invalid' });
    upsertBalance({ skuId: body.skuId, locationId: body.locationId, finalQty });
    appendLedger({
      skuId: body.skuId,
      locationId: body.locationId,
      movementType: 'initialize',
      qtyDelta: finalQty,
      note: body.note ?? null,
      actorName: actor.name,
    });
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/v1/pos/sales' && req.method === 'POST') {
    const actor = requireActor(req, res);
    if (!actor) return;
    const body = await parseBody(req);

    if (body.clientRequestId) {
      const existingSale = state.sales.find((entry) => entry.client_request_id === body.clientRequestId);
      if (existingSale) {
        return send(res, 201, {
          sale: {
            id: existingSale.id,
            saleNo: existingSale.sale_no,
            totalAmount: existingSale.total_amount,
            createdAt: existingSale.created_at,
          },
        });
      }
    }

    if (!body.locationId) return send(res, 400, { error: 'Location is required' });
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return send(res, 400, { error: 'At least one item is required' });
    }

    const saleItems = [];
    let totalAmount = 0;

    for (const line of body.items) {
      const sku = getSku(line.skuId);
      if (!sku) return send(res, 404, { error: 'SKU not found' });
      const product = getProduct(sku.product_id);
      const balance = getBalance(body.locationId, line.skuId);
      const qty = Number(line.qty ?? 0);
      const unitPrice = Number(line.unitPrice ?? sku.sale_price ?? 0);
      const availableQty = Number(balance?.available_qty ?? 0);

      if (qty <= 0) return send(res, 400, { error: 'Quantity must be positive' });
      if (availableQty < qty) return send(res, 400, { error: `Insufficient stock for ${sku.sku_code}` });

      const totalLineAmount = qty * unitPrice;
      totalAmount += totalLineAmount;
      saleItems.push({
        sku_id: sku.id,
        sku_code: sku.sku_code,
        product_name: product?.name ?? 'Unknown product',
        variant_label: buildVariantLabel(sku),
        qty,
        unit_price: unitPrice,
        total_amount: totalLineAmount,
      });
    }

    const saleId = nextId('sale', 'sale');
    const saleNo = `${state.settings.invoice_prefix || 'INV'}-${String(state.counters.sale).padStart(4, '0')}`;
    const payments = Array.isArray(body.payments) && body.payments.length
      ? body.payments.map((payment) => ({
          id: nextId('salePayment', 'sp'),
          sale_id: saleId,
          payment_method: payment.paymentMethod ?? 'cash',
          gateway_provider: payment.gatewayProvider ?? null,
          amount: Number(payment.amount ?? 0),
          reference_no: payment.referenceNo ?? null,
          status: payment.status === 'pending' ? 'pending' : 'paid',
          paid_at: payment.status === 'pending' ? null : nowIso(),
          created_at: nowIso(),
        }))
      : [
          {
            id: nextId('salePayment', 'sp'),
            sale_id: saleId,
            payment_method: 'cash',
            gateway_provider: null,
            amount: totalAmount,
            reference_no: null,
            status: 'paid',
            paid_at: nowIso(),
            created_at: nowIso(),
          },
        ];

    for (const item of saleItems) {
      const balance = getBalance(body.locationId, item.sku_id);
      if (balance) {
        balance.on_hand_qty = Number(balance.on_hand_qty) - item.qty;
        balance.available_qty = Number(balance.available_qty) - item.qty;
        balance.updated_at = nowIso();
      }

      appendLedger({
        skuId: item.sku_id,
        locationId: body.locationId,
        movementType: 'sale',
        qtyDelta: item.qty * -1,
        note: `Sale ${saleNo}`,
        actorName: actor.name,
      });
    }

    const sale = {
      id: saleId,
      client_request_id: body.clientRequestId ?? null,
      sale_no: saleNo,
      location_id: body.locationId,
      register_id: body.registerId ?? null,
      shift_id: body.shiftId ?? null,
      customer_name: body.customerName ?? null,
      customer_phone: body.customerPhone ?? null,
      customer_email: body.customerEmail ?? null,
      customer_shop_name: body.customerShopName ?? null,
      customer_address: body.customerAddress ?? null,
      customer_id: null,
      due_date: body.dueDate ?? null,
      payment_method: payments[0]?.payment_method ?? 'cash',
      payment_status: 'paid',
      status: 'completed',
      total_amount: totalAmount,
      items: saleItems,
      created_at: nowIso(),
      updated_at: nowIso(),
      note: null,
    };

    state.salePayments.push(...payments);
    sale.payment_status = getComputedPaymentStatus(sale);
    upsertCustomerFromSale(sale);
    state.sales.unshift(sale);
    pushAuditLog({
      actor,
      actionCode: 'sale.create',
      resourceType: 'sale',
      resourceId: sale.id,
      after: {
        saleNo: sale.sale_no,
        totalAmount: sale.total_amount,
        clientRequestId: sale.client_request_id,
      },
    });

    return send(res, 201, {
      sale: {
        id: sale.id,
        saleNo: sale.sale_no,
        totalAmount: sale.total_amount,
        createdAt: sale.created_at,
      },
    });
  }

  if (/^\/v1\/pos\/sales\/[^/]+$/.test(url.pathname) && req.method === 'GET') {
    const [, , , , saleId] = url.pathname.split('/');
    const sale = state.sales.find((entry) => entry.id === saleId);
    if (!sale) return send(res, 404, { error: 'Sale not found' });
    return send(res, 200, { sale });
  }

  if (/^\/v1\/pos\/sales\/[^/]+\/reprint$/.test(url.pathname) && req.method === 'POST') {
    const [, , , , saleId] = url.pathname.split('/');
    const sale = state.sales.find((entry) => entry.id === saleId);
    if (!sale) return send(res, 404, { error: 'Sale not found' });
    return send(res, 200, { receipt: buildReceiptPayload(sale) });
  }

  if (url.pathname === '/v1/store-ops/customers' && req.method === 'GET') {
    const query = String(url.searchParams.get('query') ?? '').trim().toLowerCase();
    const customers = state.customers
      .map(buildCustomerSummary)
      .filter((customer) =>
        !query ||
        [customer.full_name, customer.mobile_no, customer.email, customer.shop_name]
          .some((value) => String(value ?? '').toLowerCase().includes(query)),
      )
      .sort((left, right) => new Date(right.updated_at ?? right.created_at).getTime() - new Date(left.updated_at ?? left.created_at).getTime());
    return send(res, 200, { customers });
  }

  if (/^\/v1\/store-ops\/customers\/[^/]+$/.test(url.pathname) && req.method === 'GET') {
    const customerId = url.pathname.split('/').pop();
    const customer = getCustomer(customerId);
    if (!customer) return send(res, 404, { error: 'Customer not found' });

    const dueSales = state.sales
      .filter((sale) => sale.customer_id === customer.id)
      .map(buildCustomerDueSale)
      .filter((sale) => sale.payment_status === 'due' || sale.payment_status === 'partial')
      .sort((left, right) => new Date(left.due_date ?? left.created_at).getTime() - new Date(right.due_date ?? right.created_at).getTime());

    return send(res, 200, { customer: buildCustomerSummary(customer), dueSales });
  }

  if (url.pathname === '/v1/store-ops/due-sales/aging' && req.method === 'GET') {
    return send(res, 200, { aging: buildDueAgingPayload() });
  }

  if (/^\/v1\/store-ops\/due-sales\/[^/]+\/collections$/.test(url.pathname) && req.method === 'POST') {
    const saleId = url.pathname.split('/')[4];
    const sale = state.sales.find((entry) => entry.id === saleId);
    if (!sale) return send(res, 404, { error: 'Due sale not found' });

    const body = await parseBody(req);
    const amount = Number(body.amount ?? 0);
    const outstanding = getOutstandingAmount(sale);
    if (amount <= 0) return send(res, 400, { error: 'Collection amount must be positive' });
    if (amount > outstanding) return send(res, 403, { error: 'Collection amount is greater than outstanding due' });

    state.salePayments.push({
      id: nextId('salePayment', 'sp'),
      sale_id: sale.id,
      payment_method: body.paymentMethod ?? 'cash',
      gateway_provider: null,
      amount,
      reference_no: body.referenceNo ?? null,
      status: 'paid',
      paid_at: nowIso(),
      created_at: nowIso(),
    });

    sale.payment_status = getComputedPaymentStatus(sale);
    sale.updated_at = nowIso();
    if (body.note) {
      sale.note = sale.note ? `${sale.note}\n${body.note}` : body.note;
    }

    return send(res, 200, {
      saleId: sale.id,
      saleNo: sale.sale_no,
      collectedAmount: amount,
      outstandingAmount: getOutstandingAmount(sale),
      paymentStatus: sale.payment_status,
    });
  }

  if (url.pathname === '/v1/inventory/adjustments' && req.method === 'GET') {
    const status = url.searchParams.get('status');
    return send(res, 200, {
      adjustmentRequests: state.stockRequests
        .filter((item) => !status || item.status === status)
        .map(buildAdjustmentPayload),
    });
  }

  if (url.pathname === '/v1/inventory/adjustments/request' && req.method === 'POST') {
    const actor = requireActor(req, res);
    if (!actor) return;
    const body = await parseBody(req);
    const balance = getBalance(body.locationId, body.skuId);
    const currentQty = Number(balance?.on_hand_qty ?? 0);
    const requestedQty = Number(body.requestedQty ?? 0);
    const request = {
      id: nextId('stockRequest', 'adj'),
      location_id: body.locationId,
      sku_id: body.skuId,
      current_qty: currentQty,
      requested_qty: requestedQty,
      qty_delta: requestedQty - currentQty,
      reason: body.reason ?? '',
      status: 'pending',
      requested_by_name: actor.name,
      decision_note: null,
      created_at: nowIso(),
    };
    state.stockRequests.unshift(request);
    pushAuditLog({
      actor,
      actionCode: 'inventory.adjustment.request',
      resourceType: 'stock_adjustment_request',
      resourceId: request.id,
      after: request,
    });
    return send(res, 201, { adjustmentRequest: buildAdjustmentPayload(request) });
  }

  if (/^\/v1\/inventory\/adjustments\/[^/]+\/(approve|reject)$/.test(url.pathname) && req.method === 'POST') {
    const actor = requirePermission(req, res, 'inventory.adjust.approve');
    if (!actor) return;
    const body = await parseBody(req);
    const [, , , , requestId, decision] = url.pathname.split('/');
    const request = state.stockRequests.find((item) => item.id === requestId);
    if (!request) return send(res, 404, { error: 'Adjustment request not found' });
    request.status = decision === 'approve' ? 'approved' : 'rejected';
    request.decision_note = body.decisionNote ?? null;
    if (decision === 'approve') {
      const previousQty = Number(request.current_qty ?? 0);
      upsertBalance({
        skuId: request.sku_id,
        locationId: request.location_id,
        finalQty: Number(request.requested_qty ?? 0),
      });
      appendLedger({
        skuId: request.sku_id,
        locationId: request.location_id,
        movementType: 'adjustment_approved',
        qtyDelta: Number(request.requested_qty ?? 0) - previousQty,
        note: request.reason,
        actorName: request.requested_by_name ?? 'Store Manager',
      });
    }
    pushAuditLog({
      actor,
      actionCode: `inventory.adjustment.${decision}`,
      resourceType: 'stock_adjustment_request',
      resourceId: request.id,
      after: request,
    });
    return send(res, 200, { ok: true, decision });
  }

  return send(res, 404, { error: `Unhandled route: ${req.method} ${url.pathname}` });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock API listening on http://127.0.0.1:${PORT}`);
});
