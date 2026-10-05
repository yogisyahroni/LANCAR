import fs from 'fs';
import path from 'path';

describe('GLOB-2026-010 support cases contract', () => {
  const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

  it('keeps references, append-only timeline and idempotent actions durable', () => {
    const migration = read('../../../database/migrations/20260909000004_support_cases.sql');
    const controller = read('./controllers/supportCases.controller.ts');
    const policy = read('./services/supportCasePolicy.ts');

    expect(migration).toContain('support_case_links');
    expect(migration).toContain('support_case_events');
    expect(migration).toContain('support_case_actions');
    expect(migration).toContain('UNIQUE (case_id, idempotency_key)');
    expect(migration).toContain("reference_type IN ('order', 'payment', 'refund', 'courier', 'merchant', 'carrier', 'proof', 'claim', 'reconciliation')");
    expect(controller).toContain('event_outbox');
    expect(controller).toContain('X-Internal-Api-Key');
    expect(controller).toContain('X-Idempotency-Key');
    expect(controller).toContain('support.case.financial_action');
    expect(policy).toContain('serviceCode');
    expect(policy).toContain('marketCode');
    expect(policy).toContain('paymentStatus');
  });

  it('keeps support evidence private, retained and case-scoped', () => {
    const attachmentMigration = read('../../../database/migrations/20261005000007_support_case_attachments.sql');
    const routes = read('./routes/support.routes.ts');
    const controller = read('./controllers/supportCases.controller.ts');
    const uploadsController = read('./controllers/uploads.controller.ts');
    expect(attachmentMigration).toContain('support_case_attachments');
    expect(attachmentMigration).toContain('UNIQUE (case_id, checksum_sha256)');
    expect(attachmentMigration).toContain("INTERVAL '30 days'");
    expect(routes).toContain("'/api/v1/support/cases/:id/attachments'");
    expect(routes).toContain("secureUploadSingle('file', 'customerAttachment')");
    expect(controller).toContain('resolvePrivateUploadPath');
    expect(controller).toContain('expires_at > NOW()');
    expect(controller).toContain('canAccessCase(row, req)');
    expect(uploadsController).toContain("rawPath.startsWith('support-cases/')");
    expect(controller).toContain('resolution_code wajib diisi saat laporan diselesaikan');
  });

  it('delivers case updates durably and cleans expired private evidence', () => {
    const deliveryMigration = read('../../../database/migrations/20261005000009_support_case_delivery_retention.sql');
    const controller = read('./controllers/supportCases.controller.ts');
    const notificationWorker = read('./workers/support-case-notification-worker.ts');
    const retentionWorker = read('./workers/support-case-retention-worker.ts');
    const index = read('./index.ts');

    expect(deliveryMigration).toContain('support_case_notification_outbox');
    expect(deliveryMigration).toContain('retention_status');
    expect(controller).toContain('RETURNING id');
    expect(controller).toContain('support_case_notification_outbox');
    expect(controller).toContain("retention_status = 'active'");
    expect(notificationWorker).toContain('/api/v1/internal/communications/events');
    expect(notificationWorker).toContain('event_id: row.id');
    expect(notificationWorker).toContain("terminal ? 'dead' : 'retry'");
    expect(retentionWorker).toContain('resolvePrivateUploadPath');
    expect(retentionWorker).toContain("retention_status = 'cleaned'");
    expect(index).toContain('startSupportCaseNotificationWorker');
    expect(index).toContain('startSupportCaseRetentionWorker');
  });

  it('keeps attachment moderation explicit and role-scoped', () => {
    const moderationMigration = read('../../../database/migrations/20261005000010_support_case_attachment_moderation.sql');
    const controller = read('./controllers/supportCases.controller.ts');
    const routes = read('./routes/support.routes.ts');
    const dashboard = read('../../../admin-dashboard/src/pages/Cases.tsx');

    expect(moderationMigration).toContain('moderation_status');
    expect(moderationMigration).toContain("IN ('pending', 'approved', 'rejected')");
    expect(controller).toContain('moderateSupportCaseAttachment');
    expect(controller).toContain('moderation_status =');
    expect(controller).toContain('moderateSupportCaseAttachment');
    expect(routes).toContain("'/admin/support/cases/:id/attachments/:attachmentId'");
    expect(dashboard).toContain('attachmentModerationMutation');
    expect(dashboard).toContain('Setujui');
    expect(dashboard).toContain('Tolak');
  });

  it('requires financial actions to pass order-service reconciliation proof', () => {
    const controller = read('./controllers/supportCases.controller.ts');
    const orderRefundHandler = read('../../../backend/order-service/internal/handler/refund_handler.go');
    const orderRefundService = read('../../../backend/order-service/internal/service/refund_service.go');
    const orderMain = read('../../../backend/order-service/cmd/api/main.go');
    expect(controller).toContain("/api/v1/internal/refunds/reconcile");
    expect(controller).toContain('REFUND_NOT_RECONCILED');
    expect(orderRefundHandler).toContain('refund.reconcile');
    expect(orderRefundService).toContain('LedgerJournalPresent');
    expect(orderMain).toContain('/api/v1/internal/refunds/reconcile');
  });

  it('exposes customer and admin routes without a second support service', () => {
    const routes = read('./routes/support.routes.ts');
    const gateway = read('../../../backend/api-gateway/src/index.ts');
    const matrix = read('../../../backend/api-gateway/src/routeAuthMatrix.ts');
    const middleware = read('./middlewares.ts');
    const csrf = read('./middleware/csrfProtection.ts');

    expect(routes).toContain("'/api/v1/support/cases'");
    expect(routes).toContain("'/admin/support/cases'");
    expect(gateway).toContain("pathFilter: '/api/v1/support'");
    expect(matrix).toContain("id: 'support-case-api'");
    expect(matrix).toContain("requirement: 'web-session-or-jwt'");
    expect(csrf).toContain("['admin_session', 'merchant_session', 'customer_session', 'web_session']");
    expect(middleware).toContain("if (req.cookies?.merchant_session) {");
    expect(middleware).toContain('return verifyMerchantWebSession(req, res, next);');
  });
});
