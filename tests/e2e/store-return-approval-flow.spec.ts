import { test, expect } from '@playwright/test';

import { resetMockApi, setStoreSession } from './helpers';

test.describe('Return approval workflow', () => {
  test.beforeEach(async ({ page }) => {
    await resetMockApi(page);
  });

  test('low-value return processes immediately; high-value return requires owner approval', async ({ browser }) => {
    test.setTimeout(90_000);

    // ─── Step 1: Create a sale via API as salesman ───
    const salesCtx = await browser.newContext();
    try {
      await setStoreSession(salesCtx, 'salesman');
      const salesPage = await salesCtx.newPage();

      const saleResponse = await salesPage.request.post('http://127.0.0.1:3002/api/pos/sales', {
        data: {
          locationId: 'loc-1',
          items: [
            { skuId: 'sku-1', qty: 2, unitPrice: 6000, discountAmount: 0, taxAmount: 0 },
          ],
          payments: [
            { paymentMethod: 'cash', amount: 12000, status: 'paid' },
          ],
        },
      });

      const saleBody = await saleResponse.json();
      expect(saleResponse.ok()).toBeTruthy();
      const saleId = saleBody.sale?.id;
      expect(saleId).toBeTruthy();
      console.log(`Created sale ${saleBody.sale?.saleNo} with id ${saleId}`);

      // ─── Step 2: Process a small refund (under threshold) ───
      const smallRefundResponse = await salesPage.request.post(
        `http://127.0.0.1:3002/api/pos/sales/${saleId}/returns`,
        {
          data: {
            reason: 'Wrong size - small refund',
            refundAmount: 1500,
            items: [
              {
                saleItemId: 'saleitem-mock',
                qty: 1,
                restockToInventory: true,
                lineRefundAmount: 1500,
              },
            ],
          },
        },
      );
      expect(smallRefundResponse.ok()).toBeTruthy();
      const smallRefundBody = await smallRefundResponse.json();
      expect(smallRefundBody.saleReturn?.status).toBe('processed');
      console.log('Small refund processed immediately');

      // ─── Step 3: Process a large refund (over threshold) ───
      const largeRefundResponse = await salesPage.request.post(
        `http://127.0.0.1:3002/api/pos/sales/${saleId}/returns`,
        {
          data: {
            reason: 'Defective item - large refund needs approval',
            refundAmount: 6000,
            items: [
              {
                saleItemId: 'saleitem-mock',
                qty: 1,
                restockToInventory: true,
                lineRefundAmount: 6000,
              },
            ],
          },
        },
      );
      expect(largeRefundResponse.ok()).toBeTruthy();
      const largeRefundBody = await largeRefundResponse.json();
      expect(largeRefundBody.saleReturn?.status).toBe('pending_approval');
      expect(largeRefundBody.needsApproval).toBe(true);
      const returnId = largeRefundBody.saleReturn?.id;
      expect(returnId).toBeTruthy();
      console.log(`Large refund pending approval, returnId: ${returnId}`);

      await salesPage.close();

      // ─── Step 4: As owner, go to approvals page and approve ───
      const ownerCtx = await browser.newContext();
      try {
        await setStoreSession(ownerCtx, 'owner');
        const ownerPage = await ownerCtx.newPage();

        await ownerPage.goto('http://127.0.0.1:3002/approvals');
        await expect(ownerPage.getByRole('heading', { name: 'Pending return approvals' })).toBeVisible();
        await expect(ownerPage.getByText('Pending return approvals', { exact: true }).first()).toBeVisible();

        // Click Approve on the pending return
        const approveBtn = ownerPage.getByRole('button', { name: 'Approve' }).last();
        await expect(approveBtn).toBeVisible();
        await approveBtn.click();

        // Verify success
        await expect(ownerPage.getByText(/Return request approved successfully/)).toBeVisible({ timeout: 10_000 });
        await expect(ownerPage.getByText('No pending return approvals.')).toBeVisible();
        console.log('Owner approved the return successfully');

        await ownerPage.close();
      } finally {
        await ownerCtx.close();
      }
    } finally {
      await salesCtx.close();
    }
  });

  test('owner can reject a pending return request', async ({ browser }) => {
    test.setTimeout(90_000);

    // ─── Step 1: Create a sale then submit a large refund ───
    const salesCtx = await browser.newContext();
    try {
      await setStoreSession(salesCtx, 'salesman');
      const salesPage = await salesCtx.newPage();

      const saleResponse = await salesPage.request.post('http://127.0.0.1:3002/api/pos/sales', {
        data: {
          locationId: 'loc-1',
          items: [
            { skuId: 'sku-1', qty: 1, unitPrice: 8000, discountAmount: 0, taxAmount: 0 },
          ],
          payments: [
            { paymentMethod: 'cash', amount: 8000, status: 'paid' },
          ],
        },
      });
      const saleBody = await saleResponse.json();
      expect(saleResponse.ok()).toBeTruthy();
      const saleId = saleBody.sale?.id;

      const refundResponse = await salesPage.request.post(
        `http://127.0.0.1:3002/api/pos/sales/${saleId}/returns`,
        {
          data: {
            reason: 'Customer changed mind - large amount',
            refundAmount: 7000,
            items: [
              {
                saleItemId: 'saleitem-mock',
                qty: 1,
                restockToInventory: false,
                lineRefundAmount: 7000,
              },
            ],
          },
        },
      );
      expect(refundResponse.ok()).toBeTruthy();
      const refundBody = await refundResponse.json();
      expect(refundBody.saleReturn?.status).toBe('pending_approval');
      console.log('Large refund submitted for approval (will be rejected)');

      await salesPage.close();

      // ─── Step 2: Owner rejects the pending return ───
      const ownerCtx = await browser.newContext();
      try {
        await setStoreSession(ownerCtx, 'owner');
        const ownerPage = await ownerCtx.newPage();

        await ownerPage.goto('http://127.0.0.1:3002/approvals');
        await expect(ownerPage.getByRole('heading', { name: 'Pending return approvals' })).toBeVisible();

        // Click Reject
        const rejectBtn = ownerPage.getByRole('button', { name: 'Reject' }).last();
        await expect(rejectBtn).toBeVisible();
        await rejectBtn.click();

        await expect(ownerPage.getByText(/Return request rejected/)).toBeVisible({ timeout: 10_000 });
        await expect(ownerPage.getByText('No pending return approvals.')).toBeVisible();
        console.log('Owner rejected the return successfully');

        await ownerPage.close();
      } finally {
        await ownerCtx.close();
      }
    } finally {
      await salesCtx.close();
    }
  });
});
