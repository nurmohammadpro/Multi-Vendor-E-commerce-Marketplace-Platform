import { expect, test } from '@playwright/test';

import { resetMockApi, setStoreSession } from './helpers';

test('manager can build catalog variants and submit stock + price approvals for owner review', async ({ browser, page }) => {
  test.setTimeout(120_000);
  await resetMockApi(page, { scenario: 'blank' });

  const managerContext = await browser.newContext();
  const ownerContext = await browser.newContext();

  try {
    await setStoreSession(managerContext, 'manager');
    await setStoreSession(ownerContext, 'owner');

    const managerPage = await managerContext.newPage();
    const ownerPage = await ownerContext.newPage();

    await managerPage.goto('http://127.0.0.1:3002/catalog');

    await managerPage.getByPlaceholder('Code', { exact: true }).fill('PREMIUM');
    await managerPage.getByPlaceholder('Name', { exact: true }).fill('Premium');
    await managerPage.getByRole('button', { name: 'Create Category' }).click();
    await expect(managerPage.getByText('Category created.')).toBeVisible();

    await managerPage.getByPlaceholder('Brand name').fill('Momentum');
    await managerPage.getByRole('button', { name: 'Create Brand' }).click();
    await expect(managerPage.getByText('Brand created.')).toBeVisible();

    await managerPage.getByPlaceholder('Product code', { exact: true }).fill('WCTEE');
    await managerPage.getByPlaceholder('Product name', { exact: true }).fill('World Class Tee');
    await managerPage.getByPlaceholder('Description').fill('High quality multi-variant tee');
    await managerPage.getByRole('checkbox', { name: 'Has manual variants' }).check();
    await managerPage.locator('select').nth(2).selectOption('multi');
    await managerPage.getByRole('button', { name: 'Create Product' }).click();
    await expect(managerPage.getByText('Product created.')).toBeVisible();

    await managerPage.getByText('World Class Tee').first().click();
    await expect(managerPage.getByText('WCTEE · multi · active')).toBeVisible();

    await managerPage.getByPlaceholder('color / size / front / rear').fill('color');
    await managerPage.getByPlaceholder('Display name').fill('Color');
    await managerPage.getByRole('button', { name: 'Add Group' }).click();
    await expect(managerPage.getByText('Variant group created.')).toBeVisible();

    await managerPage.locator('select').filter({ has: managerPage.getByRole('option', { name: 'Color' }) }).last().selectOption({ label: 'Color' });
    await managerPage.getByPlaceholder('black / xl / front').fill('BLK');
    await managerPage.getByPlaceholder('Label').fill('Black');
    await managerPage.getByRole('button', { name: 'Add Option' }).click();
    await expect(managerPage.getByText('Variant option created.')).toBeVisible();

    await managerPage.locator('select').filter({ has: managerPage.getByRole('option', { name: 'Color' }) }).last().selectOption({ label: 'Color' });
    await managerPage.getByPlaceholder('black / xl / front').fill('WHT');
    await managerPage.getByPlaceholder('Label').fill('White');
    await managerPage.getByRole('button', { name: 'Add Option' }).click();

    await managerPage.getByPlaceholder('color / size / front / rear').fill('size');
    await managerPage.getByPlaceholder('Display name').fill('Size');
    await managerPage.getByRole('button', { name: 'Add Group' }).click();

    await managerPage.locator('select').filter({ has: managerPage.getByRole('option', { name: 'Size' }) }).last().selectOption({ label: 'Size' });
    await managerPage.getByPlaceholder('black / xl / front').fill('M');
    await managerPage.getByPlaceholder('Label').fill('Medium');
    await managerPage.getByRole('button', { name: 'Add Option' }).click();

    await managerPage.getByPlaceholder('Base sale price').fill('700');
    await managerPage.getByPlaceholder('Price step per combo').fill('50');
    await managerPage.getByRole('button', { name: 'Select all' }).nth(0).click();
    await managerPage.getByRole('button', { name: 'Select all' }).nth(1).click();
    await managerPage.getByRole('button', { name: 'Build Matrix' }).click();
    await expect(managerPage.getByText('Built 2 variant combination(s).')).toBeVisible();

    await managerPage.getByRole('button', { name: 'Create All SKUs' }).click();
    await expect(managerPage.getByText('Created 2 variant SKU(s) with pricing.')).toBeVisible();
    await expect(managerPage.getByRole('cell', { name: 'WCTEE-BLK-M' })).toBeVisible();

    const blackSkuId = await managerPage.evaluate(async () => {
      const productResponse = await fetch('/api/catalog/products');
      const productPayload = await productResponse.json();
      const product = productPayload.products.find((entry: { id: string; name: string }) => entry.name === 'World Class Tee');
      if (!product) throw new Error('World Class Tee product not found');

      const detailResponse = await fetch(`/api/catalog/products/${product.id}`);
      const detailPayload = await detailResponse.json();
      const sku = detailPayload.skus.find((entry: { id: string; sku_code: string }) => entry.sku_code === 'WCTEE-BLK-M');
      if (!sku) throw new Error('WCTEE-BLK-M SKU not found');

      return sku.id as string;
    });

    await managerPage.goto('http://127.0.0.1:3002/inventory');
    await expect(managerPage.getByRole('button', { name: 'Initialize Stock' })).toBeDisabled();
    await managerPage.evaluate(async (skuId: string) => {
      const response = await fetch('/api/inventory/adjustments/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: 'loc-1',
          skuId,
          requestedQty: 18,
          reason: 'Opening stock verified by manager',
        }),
      });
      if (!response.ok) {
        throw new Error(`Inventory adjustment request failed with ${response.status}`);
      }
    }, blackSkuId);

    await managerPage.evaluate(async (skuId: string) => {
      const response = await fetch('/api/catalog/price-change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId,
          costPrice: 420,
          salePrice: 760,
          compareAtPrice: 820,
          reason: 'Supplier cost and markup increased',
        }),
      });
      if (!response.ok) {
        throw new Error(`Price approval request failed with ${response.status}`);
      }
    }, blackSkuId);

    await ownerPage.goto('http://127.0.0.1:3002/approvals');
    await expect(ownerPage.getByText('World Class Tee · WCTEE-BLK').first()).toBeVisible();
    await ownerPage.getByRole('button', { name: 'Approve' }).first().click();
    await ownerPage.getByRole('button', { name: 'Approve' }).first().click();
    await expect(ownerPage.getByText('No pending stock approvals.')).toBeVisible();
    await expect(ownerPage.getByText('No pending price approvals.')).toBeVisible();

    await managerPage.goto('http://127.0.0.1:3002/inventory');
    await expect(managerPage.getByRole('cell', { name: 'World Class Tee · WCTEE-BLK-M' }).first()).toBeVisible();
    await expect(managerPage.getByRole('cell', { name: '18' }).first()).toBeVisible();

    await managerPage.goto('http://127.0.0.1:3002/catalog');
    await managerPage.getByText('World Class Tee').first().click();
    await expect(managerPage.getByRole('cell', { name: '760' }).first()).toBeVisible();
  } finally {
    await managerContext.close().catch(() => {});
    await ownerContext.close().catch(() => {});
  }
});
