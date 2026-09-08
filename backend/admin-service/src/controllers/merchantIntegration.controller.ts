import { Request, Response } from 'express';
import { readDb } from '../db';
import { securityLog } from '../security/logRedaction';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// MERCH-2026-009: Admin reads the Integration Gateway's durable projection.
// It must not infer health from a UI heartbeat or from customer order status.
export const listAdminMerchantPOSIntegrations = async (req: Request, res: Response): Promise<void> => {
  const merchantId = String(req.params.id || req.query.merchant_id || '').trim();
  if (merchantId && !UUID_RE.test(merchantId)) {
    res.status(400).json({ success: false, error: 'merchant_id tidak valid', code: 'ERR_INVALID_MERCHANT_ID' });
    return;
  }
  try {
    const result = await readDb.query(`
      SELECT b.merchant_id, b.branch_id, b.provider_code, b.enabled,
             COALESCE(h.provider_name, b.provider_code) AS provider_name,
             COALESCE(h.state, 'unknown') AS state,
             COALESCE(h.capabilities, '[]'::jsonb) AS capabilities,
             h.last_checked_at, h.last_latency_ms, COALESCE(h.consecutive_failures, 0) AS consecutive_failures,
             h.last_error, h.availability_reason,
             COALESCE((SELECT COUNT(*)::int FROM pos_reconciliation_items reconciliation
                       WHERE reconciliation.merchant_id = b.merchant_id
                         AND reconciliation.provider_code = b.provider_code
                         AND reconciliation.status = 'open'), 0) AS open_reconciliation,
             COALESCE((SELECT COUNT(*)::int FROM pos_order_deliveries delivery
                       WHERE delivery.merchant_id = b.merchant_id
                         AND delivery.provider_code = b.provider_code
                         AND delivery.status = 'failed'), 0) AS failed_order_deliveries,
             COALESCE((SELECT COUNT(*)::int FROM pos_order_deliveries delivery
                       WHERE delivery.merchant_id = b.merchant_id
                         AND delivery.provider_code = b.provider_code
                         AND delivery.status = 'pending'), 0) AS pending_order_deliveries
      FROM pos_connector_bindings b
      LEFT JOIN pos_connector_health h ON h.provider_code = b.provider_code
      WHERE ($1::uuid IS NULL OR b.merchant_id = $1::uuid)
      ORDER BY b.merchant_id, b.provider_code, b.branch_id NULLS FIRST
      LIMIT 500
    `, [merchantId || null]);
    res.json({
      success: true,
      data: result.rows,
      ownership: {
        catalog: 'lancar',
        inventory: 'lancar',
        pos_role: 'projection_and_receipt_only',
      },
      customer_acceptance_rule: 'POS receipt does not transition the canonical order; order-service merchant acceptance is required',
    });
  } catch (error: any) {
    securityLog.error('admin_merchant_pos_integrations_list_failed', {
      error: error.message,
      actor: req.headers['x-user-id'],
    });
    res.status(503).json({ success: false, error: 'Status integrasi POS belum tersedia', code: 'POS_INTEGRATION_STATE_UNAVAILABLE' });
  }
};
