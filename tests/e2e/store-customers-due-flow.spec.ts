import { expect, test } from '@playwright/test';

import { resetMockApi, setStoreSession } from './helpers';

test('owner can create a due sale and collect it from customer ledger', async ({ browser, page }) => {
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
    await ownerPage.getByRole('button', { name: 'Add' }).click();

    await ownerPage.locator('select').nth(2).selectOption('due');
    await ownerPage.getByPlaceholder('Customer name (optional)').fill('Asha Traders');
    await ownerPage.getByPlaceholder('Customer mobile number (recommended)').fill('01700000000');
    await ownerPage.getByPlaceholder('Shop name (optional but helpful)').fill('Asha Fashion House');
    await ownerPage.getByPlaceholder('Shop / customer address for due tracking').fill('Mirpur, Dhaka');
    await ownerPage.locator('input[type="date"]').fill('2026-06-29');
    await ownerPage.getByRole('button', { name: 'Save Due Sale' }).click();

    await expect(ownerPage.getByText(/Due sale INV-0001 completed/)).toBeVisible();

    await ownerPage.goto('http://127.0.0.1:3002/customers');
    await expect(ownerPage.getByText('Asha Traders')).toBeVisible();
    await expect(ownerPage.getByText('Due: 500 · Sales: 1')).toBeVisible();

    await ownerPage.getByRole('button', { name: /Asha Traders/ }).click();
    await expect(ownerPage.getByText('INV-0001')).toBeVisible();
    await expect(ownerPage.getByText('Status: due · Due date: 2026-06-29')).toBeVisible();

    await ownerPage.getByPlaceholder('Collection amount').fill('200');
    await ownerPage.getByRole('button', { name: 'Collect Due' }).click();
    await expect(ownerPage.getByText('Collected due for INV-0001. Remaining: 300')).toBeVisible();
    await expect(ownerPage.getByText('Due: 300 · Sales: 1')).toBeVisible();
    await expect(ownerPage.getByText('Status: partial · Due date: 2026-06-29')).toBeVisible();

    await ownerPage.getByRole('radio').check();
    await ownerPage.getByPlaceholder('Collection amount').fill('300');
    await ownerPage.getByRole('button', { name: 'Collect Due' }).click();
    await expect(ownerPage.getByText('Collected due for INV-0001. Remaining: 0')).toBeVisible();
    await expect(ownerPage.getByText('No due sales remain for this customer.')).toBeVisible();
    await expect(ownerPage.getByText('Due: 0 · Sales: 1')).toBeVisible();
  } finally {
    await ownerContext.close().catch(() => {});
  }
});
