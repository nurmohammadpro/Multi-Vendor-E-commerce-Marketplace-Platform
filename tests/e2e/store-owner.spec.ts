import { test, expect } from '@playwright/test';

import { resetMockApi, setStoreSession } from './helpers';

test.beforeEach(async ({ page, context }) => {
  await resetMockApi(page);
  await setStoreSession(context);
});

test('owner is redirected to approvals when pending items exist', async ({ page }) => {
  await page.goto('http://127.0.0.1:3002/');
  await expect(page).toHaveURL(/\/approvals$/);
  await expect(page.getByText('Owner approval queue')).toBeVisible();
  await expect(page.getByText('Pending stock updates')).toBeVisible();
  await expect(page.getByText('Pending price updates')).toBeVisible();
});

test('owner can update store settings and profile', async ({ page }) => {
  await page.goto('http://127.0.0.1:3002/settings');
  await page.getByPlaceholder('Invoice prefix').fill('MO');
  await page.getByPlaceholder('Receipt footer').fill('Printed by Market One');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Operational settings updated.')).toBeVisible();

  await page.getByPlaceholder('Store name', { exact: true }).fill('Market One Test Store');
  await page.getByRole('button', { name: 'Save identity' }).click();
  await expect(page.getByText('Store profile updated.')).toBeVisible();

  await page.reload();
  await expect(page.getByPlaceholder('Invoice prefix')).toHaveValue('MO');
  await expect(page.getByPlaceholder('Store name', { exact: true })).toHaveValue('Market One Test Store');
});

test('owner can clear pending approvals and return to dashboard', async ({ page }) => {
  await page.goto('http://127.0.0.1:3002/approvals');
  await page.getByRole('button', { name: 'Approve' }).first().click();
  await page.getByRole('button', { name: 'Approve' }).first().click();
  await expect(page.getByText('No pending stock approvals.')).toBeVisible();
  await expect(page.getByText('No pending price approvals.')).toBeVisible();

  await page.goto('http://127.0.0.1:3002/');
  await expect(page).not.toHaveURL(/\/approvals$/);
  await expect(page.getByText('Run daily operations from one clean control surface.')).toBeVisible();
});
