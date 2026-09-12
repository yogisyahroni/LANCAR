import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (relativePath: string) => fs.readFileSync(path.resolve(ROOT, relativePath), 'utf8');

describe('PART W-X/AE-AF platform hardening contracts', () => {
  it('keeps payment chargeback/balance/reputation/CRM history append-only and versioned', () => {
    const migration = read('database/migrations/20260912000009_platform_hardening.sql');
    expect(migration).toContain('payment_chargeback_events');
    expect(migration).toContain('payment_balance_entries');
    expect(migration).toContain('reputation_signal_snapshots');
    expect(migration).toContain('crm_campaign_exposures');
    expect(migration).toContain('reject_platform_financial_history_update');
  });

  it('keeps loyalty mutations on an internal authenticated, idempotent ledger boundary', () => {
    const controller = read('backend/admin-service/src/controllers/loyalty.controller.ts');
    const routes = read('backend/admin-service/src/routes.ts');
    expect(controller).toContain('timingSafeEqual');
    expect(controller).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
    expect(controller).toContain('loyalty_ledger_entries');
    expect(routes).toContain("/api/internal/loyalty/order-events");
  });

  it('keeps emergency contacts encrypted and user-scoped', () => {
    const controller = read('backend/admin-service/src/controllers/safety.controller.ts');
    const routes = read('backend/admin-service/src/routes/order.routes.ts');
    expect(controller).toContain('SAFETY_CONTACT_ENCRYPTION_KEY');
    expect(controller).toContain('aes-256-gcm');
    expect(controller).toContain('WHERE id = $1 AND user_id = $2');
    expect(routes).toContain('/api/v1/customer/safety/emergency-contacts');
  });

  it('keeps the admin control plane on the correct host boundary', () => {
    const dashboard = read('admin-dashboard/src/pages/PlatformOperations.tsx');
    const compose = read('docker-compose.yml');
    expect(dashboard).toContain('/admin/payment/health');
    expect(compose).toContain('admin-dashboard');
  });
});
