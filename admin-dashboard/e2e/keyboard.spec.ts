import { expect, test } from '@playwright/test';

async function installAdminShellFixture(page: import('@playwright/test').Page) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'admin-modal-keyboard-fixture', name: 'Admin Modal Fixture', role: 'super_admin', permissions: [] } }),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/dashboard/events')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.continue();
  });
}

test('Admin login keeps the primary form keyboard reachable and announces auth errors @keyboard', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' });
  const email = page.getByLabel('Email Address');
  const password = page.getByLabel('Password');
  await email.focus();
  await expect(email).toBeFocused();
  await expect.poll(() => email.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px');
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('checkbox', { name: /remember/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /forgot password/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /sign in to console/i })).toBeFocused();
});

test('Admin support case row action keeps its name, focus, and Enter activation @keyboard @a11y', async ({ page }) => {
  const supportCase = {
    id: 'case-row-action-fixture',
    case_number: 'CASE-ROW-001',
    category: 'order',
    subject: 'Keyboard row action fixture',
    description: 'A deterministic support case for keyboard verification.',
    service_code: 'food_delivery',
    market_code: 'ID',
    priority: 'high',
    status: 'open',
    assigned_to_name: 'Accessibility Fixture',
    escalation_level: 0,
    sla_due_at: '2026-09-12T00:00:00.000Z',
    sla_breached: false,
    links: [],
    events: [],
    policy: { allowedActions: [], suggestedActions: [], reason: 'Fixture policy.' },
    authoritative: {},
  };

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'case-row-keyboard-fixture', name: 'Case Row Fixture', role: 'super_admin', permissions: [] } }),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/support/cases')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [supportCase], total: 1 }) });
      return;
    }
    if (url.pathname.endsWith(`/admin/support/cases/${supportCase.id}`)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: supportCase }) });
      return;
    }
    if (url.pathname.endsWith('/admin/dashboard/events')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/cases', { waitUntil: 'domcontentloaded' });
  const action = page.getByRole('button', { name: 'Open CASE-ROW-001' });
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute('title', 'Open CASE-ROW-001');
  await action.focus();
  await expect(action).toBeFocused();
  await expect.poll(() => action.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('dialog', { name: 'Keyboard row action fixture' })).toBeVisible();
});

test('Admin resi template icon actions retain names and keyboard activation @keyboard @a11y', async ({ page }) => {
  const template = {
    id: 'resi-template-icon-fixture',
    name: 'Keyboard Resi Template',
    layout_config: { elements: [] },
    is_active: false,
    provider_code: 'fixture',
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
  };
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'resi-template-keyboard-fixture', name: 'Resi Template Fixture', role: 'super_admin', permissions: [] } }) });
      return;
    }
    if (url.pathname.endsWith('/admin/resi-templates')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([template]) });
      return;
    }
    if (url.pathname.endsWith('/admin/logistics-providers')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (url.pathname.endsWith('/admin/dashboard/events')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/resi-templates', { waitUntil: 'domcontentloaded' });
  const edit = page.getByRole('button', { name: 'Edit Keyboard Resi Template' });
  await expect(edit).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete Keyboard Resi Template' })).toContainText('Delete');
  await edit.focus();
  await expect(edit).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit Resi Template' })).toBeVisible();
});

test('Admin collapsed sidebar preserves names, current location and focus @keyboard', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'keyboard-fixture', name: 'Keyboard Fixture', role: 'super_admin', permissions: [] } }),
      });
      return;
    }
    if (url.includes('/admin/dashboard/events')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#main-content')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();

  const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
  await expect(dashboardLink).toHaveAttribute('aria-label', 'Dashboard');
  await expect(dashboardLink).toHaveAttribute('title', 'Dashboard');
  await expect(dashboardLink).toHaveAttribute('aria-current', 'page');
  await dashboardLink.focus();
  await expect(dashboardLink).toBeFocused();
  await expect.poll(() => dashboardLink.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe('0px');
});

test('Admin notification popover exposes expanded state and restores keyboard focus @keyboard @a11y', async ({ page }) => {
  await installAdminShellFixture(page);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  const trigger = page.getByRole('button', { name: 'Notifications', exact: true });
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Notifications' });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByRole('button', { name: 'Clear All' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('Admin feature flag switch exposes state and Escape restores focus @keyboard @a11y', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'feature-flag-keyboard-fixture',
            name: 'Feature Flag Keyboard Fixture',
            role: 'super_admin',
            permissions: ['experience.read', 'experience.feature_flag.write'],
          },
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/feature-flags')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ key: 'semantic_state_fixture', name: 'Semantic state fixture', category: 'ui', is_enabled: false }]),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/audit-logs')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (url.pathname.endsWith('/admin/dashboard/events')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/app-experience/feature-flags', { waitUntil: 'domcontentloaded' });

  const switchControl = page.getByRole('switch', { name: 'Aktifkan semantic_state_fixture' });
  await expect(switchControl).toBeVisible();
  await expect(switchControl).toHaveAttribute('aria-checked', 'false');
  await switchControl.focus();
  await expect(switchControl).toBeFocused();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Aktifkan Feature?' });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Alasan Perubahan (wajib)')).toBeVisible();
  await expect(page.getByLabel('Rollback Plan (wajib untuk high-blast flag)')).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(switchControl).toBeFocused();
});

test('Admin courier retention dialog traps focus and Escape restores focus @keyboard @a11y', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'retention-keyboard-fixture', name: 'Retention Fixture', role: 'super_admin', permissions: [] } }),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/courier-retention')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ couriers: [{ courier_profile_id: 'courier-retention-1', full_name: 'Retention Fixture Courier', email: 'retention@example.test', user_status: 'approved', completed_orders: 12, cancelled_orders: 1, training_count: 2 }] }),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/dashboard/events')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/courier-retention', { waitUntil: 'domcontentloaded' });
  const retrainingButton = page.getByRole('button', { name: 'Retraining' });
  await expect(retrainingButton).toBeVisible();
  await retrainingButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Buat retraining' });
  await expect(dialog).toBeVisible();
  const reason = page.getByLabel('Alasan');
  const cancelButton = dialog.getByRole('button', { name: 'Batal' });
  const saveButton = dialog.getByRole('button', { name: 'Simpan' });
  await expect(reason).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(saveButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(reason).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(retrainingButton).toBeFocused();
  await expect(cancelButton).not.toBeVisible();
});

test('Admin meeting point form traps focus and Escape restores focus @keyboard @a11y', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'meeting-point-keyboard-fixture', name: 'Meeting Point Fixture', role: 'super_admin', permissions: [] } }),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/meeting-points')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (url.pathname.endsWith('/admin/dashboard/events')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/meeting-points', { waitUntil: 'domcontentloaded' });
  const addButton = page.getByRole('button', { name: 'Tambah titik' });
  await expect(addButton).toBeVisible();
  await addButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Tambah meeting point' });
  await expect(dialog).toBeVisible();
  const closeButton = page.getByRole('button', { name: 'Tutup form meeting point' });
  const saveButton = dialog.getByRole('button', { name: 'Simpan' });
  await expect(closeButton).toBeFocused();
  await expect(page.getByLabel('Nama')).toBeVisible();
  await expect(page.getByLabel('Alamat')).toBeVisible();
  await expect(page.getByLabel('Aktif untuk matching')).toBeChecked();
  await page.keyboard.press('Shift+Tab');
  await expect(saveButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(addButton).toBeFocused();
});

test('Admin broadcast confirmation traps focus and Escape restores focus @keyboard @a11y', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'broadcast-keyboard-fixture', name: 'Broadcast Fixture', role: 'super_admin', permissions: [] } }),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/broadcasts')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], total: 0 }) });
      return;
    }
    if (url.pathname.endsWith('/admin/broadcasts/targets/estimate')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { estimated_targets: 1 } }) });
      return;
    }
    if (url.pathname.endsWith('/admin/zones')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (url.pathname.endsWith('/admin/dashboard/events')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/broadcasts', { waitUntil: 'domcontentloaded' });
  const openButton = page.getByRole('button', { name: 'Buat Broadcast Baru' });
  await expect(openButton).toBeVisible();
  await openButton.focus();
  await page.keyboard.press('Enter');

  const sendButton = page.getByRole('button', { name: 'Kirim Sekarang' });
  await expect(sendButton).toBeVisible();
  await sendButton.focus();
  await page.getByLabel('Judul').fill('Keyboard broadcast');
  await page.getByLabel('Isi Pesan').fill('Pesan broadcast untuk verifikasi keyboard.');
  await sendButton.click();

  const dialog = page.getByRole('dialog', { name: 'Kirim Broadcast?' });
  await expect(dialog).toBeVisible();
  const cancelButton = dialog.getByRole('button', { name: 'Batal' });
  const continueButton = dialog.getByRole('button', { name: 'Ya, Lanjutkan' });
  await expect(cancelButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(continueButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancelButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(sendButton).toBeFocused();
});

test('Admin broadcast delivery report dismisses on Escape and restores focus @keyboard @a11y', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'broadcast-report-keyboard-fixture', name: 'Broadcast Report Fixture', role: 'super_admin', permissions: [] } }),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/broadcasts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{
            id: 'broadcast-report-fixture',
            title: 'Broadcast report fixture',
            body: 'Fixture body',
            category: 'operational',
            priority: 'normal',
            channels: ['in_app'],
            target_type: 'all',
            status: 'sent',
            scheduled_at: null,
            sent_at: '2026-09-11T00:00:00Z',
            total_targets: 1,
            sent_count: 1,
            failed_count: 0,
            opened_count: 1,
            created_at: '2026-09-11T00:00:00Z',
          }],
          total: 1,
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/broadcasts/broadcast-report-fixture/report')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          broadcast_id: 'broadcast-report-fixture',
          status: 'sent',
          totals: { total_targets: 1, sent_count: 1, failed_count: 0, opened_count: 1 },
          per_channel: [{ channel: 'in_app', pending: 0, sent: 1, failed: 0, opened: 1 }],
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/admin/dashboard/events')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (route.request().resourceType() === 'xhr' || route.request().resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/broadcasts', { waitUntil: 'domcontentloaded' });
  const reportButton = page.getByRole('button', { name: 'Lihat report Broadcast report fixture' });
  await expect(reportButton).toBeVisible();
  await reportButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Delivery Report' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Tutup laporan' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(reportButton).toBeFocused();
});

test('Admin login associates server errors with both credential fields @a11y', async ({ page }) => {
  await page.route('**/auth/web/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
  });
  await page.goto('/login', { waitUntil: 'networkidle' });

  const email = page.getByLabel('Email Address');
  const password = page.getByLabel('Password');
  await email.fill('admin@example.test');
  await password.fill('incorrect-password');
  await page.getByRole('button', { name: /sign in to console/i }).click();

  await expect(page.locator('#admin-login-error')).toContainText('Invalid credentials');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toHaveAttribute('aria-describedby', 'admin-login-error');
  await expect(password).toHaveAttribute('aria-describedby', 'admin-login-error');
});

test('Admin manual order dialog traps focus and restores the create trigger @keyboard @a11y', async ({ page }) => {
  await installAdminShellFixture(page);
  await page.goto('/orders', { waitUntil: 'domcontentloaded' });

  const trigger = page.getByRole('button', { name: 'Create Manual Order' });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Create Manual Order' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('Admin chart-of-accounts dialog exposes a name and Escape dismissal @keyboard @a11y', async ({ page }) => {
  await installAdminShellFixture(page);
  await page.goto('/chart-of-accounts', { waitUntil: 'domcontentloaded' });

  const trigger = page.getByRole('button', { name: 'Add Account' });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Add Account' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
