import { expect, test } from '@playwright/test';

import { resetMockApi, setStoreSession } from './helpers';

test.describe('store API permission enforcement', () => {
  test('manager cannot update store settings', async ({ browser, page }) => {
    await resetMockApi(page);
    const context = await browser.newContext();

    try {
      await setStoreSession(context, 'manager');
      const appPage = await context.newPage();
      await appPage.goto('http://127.0.0.1:3002/');

      const result = await appPage.evaluate(async () => {
        const response = await fetch('/api/store/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: 'UTC' }),
        });
        return { status: response.status };
      });

      expect(result.status).toBe(403);
    } finally {
      await context.close().catch(() => {});
    }
  });

  test('salesman cannot create catalog categories or read audit logs', async ({ browser, page }) => {
    await resetMockApi(page);
    const context = await browser.newContext();

    try {
      await setStoreSession(context, 'salesman');
      const appPage = await context.newPage();
      await appPage.goto('http://127.0.0.1:3002/');

      const results = await appPage.evaluate(async () => {
        const categoryResponse = await fetch('/api/catalog/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'TEST', name: 'Test Category' }),
        });
        const auditResponse = await fetch('/api/audit/logs');
        return {
          categoryStatus: categoryResponse.status,
          auditStatus: auditResponse.status,
        };
      });

      expect(results.categoryStatus).toBe(403);
      expect(results.auditStatus).toBe(403);
    } finally {
      await context.close().catch(() => {});
    }
  });

  test('owner can read audit logs after a sale', async ({ browser, page }) => {
    await resetMockApi(page);
    const context = await browser.newContext();

    try {
      await setStoreSession(context, 'owner');
      const appPage = await context.newPage();
      await appPage.goto('http://127.0.0.1:3002/pos');

      await appPage.getByPlaceholder('Scan barcode or search product / SKU').fill('TSHIRT-BLK-M');
      await appPage.getByRole('button', { name: 'Search' }).click();
      await appPage.getByRole('button', { name: 'Choose Variant' }).click();
      await appPage.getByRole('button', { name: 'Add Variant' }).click();
      await appPage.getByPlaceholder('Amount paid by customer').fill('500');
      await appPage.getByRole('button', { name: 'Complete Sale' }).click();

      const auditPayload = await appPage.evaluate(async () => {
        const response = await fetch('/api/audit/logs');
        return response.json();
      });

      expect(Array.isArray(auditPayload.logs)).toBeTruthy();
      expect(auditPayload.logs.some((entry: { action_code?: string }) => entry.action_code === 'sale.create')).toBeTruthy();
    } finally {
      await context.close().catch(() => {});
    }
  });
});
