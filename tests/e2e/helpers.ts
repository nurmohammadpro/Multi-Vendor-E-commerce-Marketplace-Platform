import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function resetMockApi(page: Page) {
  const response = await page.request.post('http://127.0.0.1:4010/reset');
  expect(response.ok()).toBeTruthy();
}

export async function signInAsOwner(page: Page) {
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForTimeout(2600);
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Password').fill('ChangeMe-Store-123!');
  await page.getByRole('button', { name: 'Store Staff' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function setStoreSession(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'auth_token',
      value: 'e2e-owner-token',
      url: 'http://127.0.0.1:3002',
    },
    {
      name: 'store_id',
      value: 'store_test',
      url: 'http://127.0.0.1:3002',
    },
  ]);
}
