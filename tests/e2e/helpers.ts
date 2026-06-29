import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function resetMockApi(page: Page, options?: { scenario?: 'default' | 'blank' }) {
  const response = await page.request.post('http://127.0.0.1:4010/reset', {
    data: options?.scenario ? { scenario: options.scenario } : undefined,
  });
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

export async function signInAsManager(page: Page) {
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForTimeout(2600);
  await page.getByLabel('Email').fill('manager@example.com');
  await page.getByLabel('Password').fill('ChangeMe-Store-123!');
  await page.getByRole('button', { name: 'Store Staff' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function setStoreSession(context: BrowserContext, role: 'owner' | 'manager' = 'owner') {
  const token = role === 'owner' ? 'e2e-owner-token' : 'e2e-manager-token';
  await context.addCookies([
    {
      name: 'auth_token',
      value: token,
      url: 'http://127.0.0.1:3002',
    },
    {
      name: 'store_id',
      value: 'store_test',
      url: 'http://127.0.0.1:3002',
    },
  ]);
}
