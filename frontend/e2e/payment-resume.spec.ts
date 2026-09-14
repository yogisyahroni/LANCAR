import { expect, test } from '@playwright/test';

const PENDING_KEY = 'tembus.ondemand.pending-transaction';
const ORDER_ID = 'order-payment-resume-fixture';

test('customer resumes a pending payment after the app page is closed', async ({ page }) => {
  await page.context().addCookies([
    { name: 'tembus_web_session', value: 'payment-resume-fixture', domain: 'localhost', path: '/' },
  ]);

  await page.context().route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'payment-resume-customer', full_name: 'Payment Resume Fixture' } }),
      });
      return;
    }
    if (url.pathname.endsWith(`/auth/web/orders/${ORDER_ID}`) && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ order: { id: ORDER_ID, order_number: 'TMB-RESUME-1', status: 'pending_payment', total_price_idr: 25000 } }),
      });
      return;
    }
    if (url.pathname.endsWith(`/auth/web/orders/${ORDER_ID}/payment/session`) && request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          payment: {
            payment_status: 'pending',
            order_status: 'pending_payment',
            snap_token: 'snap-resume-fixture',
            active_payment_provider: 'midtrans',
            amount_minor: 25000,
            currency: 'IDR',
          },
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/auth/web/delivery-services')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ services: [{
          code: 'tembus_instant',
          name: 'Paket Instan',
          description: 'Pengiriman cepat',
          service_category: 'package_on_demand',
          vehicle_types: ['motorcycle'],
          size_tiers: [],
        }] }),
      });
      return;
    }
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.addInitScript(({ key, orderId }) => {
    window.localStorage.setItem(key, JSON.stringify({
      fingerprint: 'resume-fingerprint',
      idempotency_key: 'resume-create-key',
      order_id: orderId,
      created_at: Date.now(),
    }));
  }, { key: PENDING_KEY, orderId: ORDER_ID });

  await page.goto('/orders/new/ondemand', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status')).toContainText('Order sudah tersimpan');

  await page.close();
  const resumedPage = await page.context().newPage();
  await resumedPage.goto('/orders/new/ondemand', { waitUntil: 'domcontentloaded' });
  await expect(resumedPage.getByRole('button', { name: 'Lanjutkan pembayaran' })).toBeVisible();

  const paymentSession = resumedPage.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'POST' && url.pathname.endsWith(`/auth/web/orders/${ORDER_ID}/payment/session`);
  });
  await resumedPage.getByRole('button', { name: 'Lanjutkan pembayaran' }).click();
  expect((await paymentSession).status()).toBe(200);
  await expect(resumedPage.getByRole('dialog')).toBeVisible();
  await expect(resumedPage.getByRole('heading', { name: /Pembayaran/ })).toBeVisible();
  await resumedPage.close();
});
