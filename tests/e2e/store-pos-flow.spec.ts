import { expect, test } from '@playwright/test';

import { resetMockApi, setStoreSession } from './helpers';

test('owner POS sale deducts stock and records a ledger movement', async ({ browser, page }) => {
  test.setTimeout(120_000);
  await resetMockApi(page);

  const ownerContext = await browser.newContext();

  try {
    await setStoreSession(ownerContext, 'owner');
    const ownerPage = await ownerContext.newPage();

    await ownerPage.goto('http://127.0.0.1:3002/pos');
    await expect(ownerPage.locator('select').first()).toHaveValue('reg-1');

    await ownerPage.getByPlaceholder('Opening cash').fill('1000');
    await ownerPage.getByRole('button', { name: 'Open Shift' }).click();
    await expect(ownerPage.getByText('Shift opened successfully.')).toBeVisible();

    await ownerPage.getByPlaceholder('Scan barcode or search product / SKU').fill('TSHIRT-BLK-M');
    await ownerPage.getByRole('button', { name: 'Search' }).click();
    await expect(ownerPage.getByText('T-Shirt')).toBeVisible();
    await expect(ownerPage.getByText('Stock: 10 · Price: 500.00')).toBeVisible();

    await ownerPage.getByRole('button', { name: 'Add' }).click();
    await ownerPage.getByRole('button', { name: '+' }).click();
    await expect(ownerPage.locator('article').filter({ hasText: 'TSHIRT-BLK-M · Color: Black / Size: M' }).last()).toBeVisible();
    await expect(ownerPage.locator('strong').filter({ hasText: '1000.00' }).last()).toBeVisible();

    await ownerPage.getByPlaceholder('Cash received').fill('1200');
    await ownerPage.getByRole('button', { name: 'Complete Sale' }).click();
    await expect(ownerPage.getByText(/Sale INV-0001 completed\./)).toBeVisible();
    await expect(ownerPage.getByText('Latest invoice preview')).toBeVisible();

    await ownerPage.goto('http://127.0.0.1:3002/inventory');
    await expect(ownerPage.getByText('On hand: 8 · Available: 8 · Reserved: 0')).toBeVisible();
    await expect(ownerPage.getByText('sale · -2')).toBeVisible();
  } finally {
    await ownerContext.close().catch(() => {});
  }
});
