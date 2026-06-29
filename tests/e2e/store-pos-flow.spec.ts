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
    await expect(ownerPage.getByText('Shift controls are hidden for now.')).toBeVisible();

    await ownerPage.getByPlaceholder('Scan barcode or search product / SKU').fill('TSHIRT-BLK-M');
    await expect(ownerPage.getByText('T-Shirt')).toBeVisible();
    await ownerPage.getByRole('button', { name: 'Choose Variant' }).click();
    await expect(ownerPage.getByText('Select the exact variant before adding it to the cart.')).toBeVisible();
    await expect(ownerPage.getByText('TSHIRT-BLK-M')).toBeVisible();

    await ownerPage.getByRole('button', { name: 'Add Variant' }).first().click();
    await ownerPage.getByRole('button', { name: '+' }).click();
    await expect(ownerPage.getByText('TSHIRT-BLK-M · Color: Black / Size: M')).toBeVisible();
    await expect(ownerPage.locator('strong').filter({ hasText: '1000.00' }).last()).toBeVisible();

    await ownerPage.getByPlaceholder('Amount paid by customer').fill('1200');
    await ownerPage.getByRole('button', { name: 'Complete Sale' }).click();
    await expect(ownerPage.getByText(/Sale INV-0001 completed\./)).toBeVisible();
    await expect(ownerPage.getByText('Latest invoice preview')).toBeVisible();

    await ownerPage.goto('http://127.0.0.1:3002/inventory');
    await expect(ownerPage.getByRole('cell', { name: 'T-Shirt · TSHIRT-BLK-M' }).first()).toBeVisible();
    await expect(ownerPage.getByRole('cell', { name: '8' }).first()).toBeVisible();
    await expect(ownerPage.getByRole('cell', { name: 'sale' }).first()).toBeVisible();
    await expect(ownerPage.getByRole('cell', { name: '-2' }).first()).toBeVisible();
  } finally {
    await ownerContext.close().catch(() => {});
  }
});
