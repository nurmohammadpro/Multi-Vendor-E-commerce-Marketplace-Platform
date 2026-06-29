import http from 'node:http';
import { URL } from 'node:url';

const PORT = 4010;

const defaultState = () => ({
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
  stockRequests: [
    {
      id: 'adj-1',
      location_id: 'loc-1',
      location_name: 'Main Store',
      sku_id: 'sku-1',
      sku_code: 'TSHIRT-BLK-M',
      product_name: 'T-Shirt',
      current_qty: 10,
      requested_qty: 15,
      qty_delta: 5,
      reason: 'Manager counted extra stock',
      status: 'pending',
      requested_by_name: 'Store Manager',
      created_at: new Date().toISOString(),
    },
  ],
  priceRequests: [
    {
      id: 'pcr-1',
      sku_id: 'sku-1',
      sku_code: 'TSHIRT-BLK-M',
      product_name: 'T-Shirt',
      variant_label: 'Color: Black / Size: M',
      current_sale_price: 500,
      requested_sale_price: 550,
      current_cost_price: 300,
      requested_cost_price: 320,
      current_compare_at_price: 600,
      requested_compare_at_price: 650,
      reason: 'Supplier cost increased',
      status: 'pending',
      requested_by_name: 'Store Manager',
      created_at: new Date().toISOString(),
    },
  ],
});

let state = defaultState();

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

const sessionProfile = () => ({
  user: {
    id: 'user-owner',
    email: 'owner@example.com',
    phone: '+8801000000001',
    preferredLocale: 'en',
    status: 'active',
  },
  contexts: [
    {
      type: 'store',
      storeId: 'store_test',
      storeName: state.store.name,
      roles: ['store_owner'],
      permissions: [
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
      ],
    },
  ],
  permissions: [
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
  ],
  session: {
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  },
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (url.pathname === '/reset' && req.method === 'POST') {
    state = defaultState();
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/v1/auth/login' && req.method === 'POST') {
    const body = await parseBody(req);
    if ((body.email === 'owner@example.com' || body.phone === '+8801000000001') && body.password === 'ChangeMe-Store-123!') {
      return send(res, 200, {
        tokenType: 'Bearer',
        accessToken: 'e2e-owner-token',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        user: {
          id: 'user-owner',
          tenantId: 'tenant-1',
          email: 'owner@example.com',
          phone: '+8801000000001',
          preferredLocale: 'en',
        },
        contexts: [{ type: 'store', storeId: 'store_test', roles: ['store_owner'] }],
      });
    }
    return send(res, 401, { message: 'Invalid credentials' });
  }

  if (url.pathname === '/v1/auth/contexts' && req.method === 'GET') {
    if (getToken(req) !== 'e2e-owner-token') return send(res, 401, { error: 'Unauthorized' });
    return send(res, 200, { contexts: [{ type: 'store', storeId: 'store_test', roles: ['store_owner'] }] });
  }

  if (url.pathname === '/v1/auth/select-context' && req.method === 'POST') {
    if (getToken(req) !== 'e2e-owner-token') return send(res, 401, { error: 'Unauthorized' });
    return send(res, 200, { activeContext: { type: 'store', storeId: 'store_test', roles: ['store_owner'] } });
  }

  if (url.pathname === '/v1/auth/me' && req.method === 'GET') {
    if (getToken(req) !== 'e2e-owner-token') return send(res, 401, { error: 'Unauthorized' });
    return send(res, 200, sessionProfile());
  }

  if (url.pathname === '/v1/auth/logout' && req.method === 'POST') {
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/v1/billing/subscription/summary' && req.method === 'GET') {
    return send(res, 200, {
      subscription: {
        plan_code: 'pro',
        plan_name: 'Pro',
        status: 'active',
      },
    });
  }

  if (url.pathname === '/v1/reports/store/sales' && req.method === 'GET') {
    return send(res, 200, {
      summary: {
        total_sales_amount: 12000,
        total_orders_count: 12,
      },
      recentSales: [],
      dueSales: [],
    });
  }

  if (url.pathname === '/v1/reports/store/inventory' && req.method === 'GET') {
    return send(res, 200, {
      summary: {
        total_available_qty: 42,
        sku_count: 8,
        total_on_hand_qty: 50,
      },
      balances: [],
    });
  }

  if (url.pathname === '/v1/stores/store_test' && req.method === 'GET') {
    return send(res, 200, { store: state.store });
  }

  if (url.pathname === '/v1/stores/store_test' && req.method === 'PATCH') {
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
    return send(res, 200, { store: state.store });
  }

  if (url.pathname === '/v1/stores/store_test/settings' && req.method === 'GET') {
    return send(res, 200, { settings: state.settings });
  }

  if (url.pathname === '/v1/stores/store_test/settings' && req.method === 'PATCH') {
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
    return send(res, 200, { settings: state.settings });
  }

  if (url.pathname === '/v1/inventory/adjustments' && req.method === 'GET') {
    const status = url.searchParams.get('status');
    return send(res, 200, {
      adjustmentRequests: status ? state.stockRequests.filter((item) => item.status === status) : state.stockRequests,
    });
  }

  if (/^\/v1\/inventory\/adjustments\/[^/]+\/(approve|reject)$/.test(url.pathname) && req.method === 'POST') {
    const [, , , , requestId, decision] = url.pathname.split('/');
    state.stockRequests = state.stockRequests.map((item) =>
      item.id === requestId ? { ...item, status: decision === 'approve' ? 'approved' : 'rejected' } : item,
    );
    return send(res, 200, { ok: true, decision });
  }

  if (url.pathname === '/v1/catalog/price-change-requests' && req.method === 'GET') {
    const status = url.searchParams.get('status');
    return send(res, 200, {
      priceChangeRequests: status ? state.priceRequests.filter((item) => item.status === status) : state.priceRequests,
    });
  }

  if (/^\/v1\/catalog\/price-change-requests\/[^/]+\/(approve|reject)$/.test(url.pathname) && req.method === 'POST') {
    const [, , , , requestId, decision] = url.pathname.split('/');
    state.priceRequests = state.priceRequests.map((item) =>
      item.id === requestId ? { ...item, status: decision === 'approve' ? 'approved' : 'rejected' } : item,
    );
    return send(res, 200, { ok: true, decision });
  }

  return send(res, 404, { error: `Unhandled route: ${req.method} ${url.pathname}` });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock API listening on http://127.0.0.1:${PORT}`);
});
