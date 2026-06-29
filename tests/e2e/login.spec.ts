import { test, expect } from '@playwright/test';

import { resetMockApi, signInAsOwner } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetMockApi(page);
});

test('login splash completes and store login redirects into store workspace URL', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  await expect(page.locator('.intro-splash')).toBeVisible();
  await page.waitForTimeout(2600);
  await expect(page.locator('.intro-splash')).toBeHidden();

  await signInAsOwner(page);
  await expect(page).toHaveURL(/127\.0\.0\.1:3002\/approvals$/);
});
