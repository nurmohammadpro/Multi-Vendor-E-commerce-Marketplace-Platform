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
    await expect(managerPage.locator('article').filter({ hasText: 'WCTEE-BLK' }).first()).toBeVisible();

    await managerPage.goto('http://127.0.0.1:3002/inventory');
    await expect(managerPage.getByRole('button', { name: 'Initialize Stock' })).toBeDisabled();
    await managerPage.getByPlaceholder('Search SKU or product').fill('World Class Tee');
    await managerPage.getByRole('button', { name: 'Search' }).click();
    await managerPage.locator('select').nth(1).selectOption({ label: 'WCTEE-BLK — World Class Tee · Color: Black' });
    await managerPage.getByPlaceholder('Quantity or requested final qty').fill('18');
    await managerPage.getByPlaceholder('Reason / note').fill('Opening stock verified by manager');
    await managerPage.getByRole('button', { name: 'Request Change' }).click();
    await expect(managerPage.getByText('Adjustment request submitted for owner approval.')).toBeVisible();

    await managerPage.goto('http://127.0.0.1:3002/catalog');
    await managerPage.getByText('World Class Tee').first().click();
    await managerPage.locator('select').filter({ has: managerPage.getByRole('option', { name: 'WCTEE-BLK' }) }).last().selectOption({ label: 'WCTEE-BLK' });
    await managerPage.getByPlaceholder('Cost price', { exact: true }).fill('420');
    await managerPage.getByPlaceholder('Sale price', { exact: true }).fill('760');
    await managerPage.getByPlaceholder('Compare at price', { exact: true }).fill('820');
    await managerPage.getByPlaceholder('Reason for manager price update request').fill('Supplier cost and markup increased');
    await managerPage.getByRole('button', { name: 'Request Price Approval' }).click();
    await expect(managerPage.getByText('Price update submitted for owner approval.')).toBeVisible();

    await ownerPage.goto('http://127.0.0.1:3002/approvals');
    await expect(ownerPage.getByText('World Class Tee · WCTEE-BLK').first()).toBeVisible();
    await ownerPage.getByRole('button', { name: 'Approve' }).first().click();
    await ownerPage.getByRole('button', { name: 'Approve' }).first().click();
    await expect(ownerPage.getByText('No pending stock approvals.')).toBeVisible();
    await expect(ownerPage.getByText('No pending price approvals.')).toBeVisible();

    await managerPage.goto('http://127.0.0.1:3002/inventory');
    await expect(managerPage.getByText('On hand: 18 · Available: 18 · Reserved: 0')).toBeVisible();

    await managerPage.goto('http://127.0.0.1:3002/catalog');
    await managerPage.getByText('World Class Tee').first().click();
    await expect(managerPage.getByText('Price: 760')).toBeVisible();
  } finally {
    await managerContext.close().catch(() => {});
    await ownerContext.close().catch(() => {});
  }
});
