import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:8084';

export const getReconciliationLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, discrepancy_only, limit = 50, offset = 0 } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (discrepancy_only === 'true') {
      conditions.push(`discrepancy_idr != 0`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const queryStr = `
      SELECT * FROM wallet_reconciliation_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(Number(limit), Number(offset));

    const result = await readDb.query(queryStr, params);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error fetching reconciliation logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const triggerWalletReconciliation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { wallet_id } = req.body;
    if (!wallet_id) {
      res.status(400).json({ success: false, error: 'wallet_id is required' });
      return;
    }

    const actorId = getActorId(req);

    const response = await fetch(`${PAYMENT_SERVICE_URL}/api/v1/wallet/reconcile`, {
      method: 'POST',
      headers: {
        'X-User-ID': actorId,
        'X-User-Role': 'finance_admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ wallet_id }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status).json({ success: false, error: data.error || 'Reconciliation request failed' });
      return;
    }

    await db.query(
      `INSERT INTO system_audit_logs (actor_id, action, entity_type, entity_id, new_data, created_at)
       VALUES ($1, 'TRIGGER_RECONCILIATION', 'wallet', $2, $3, NOW())`,
      [actorId, wallet_id, JSON.stringify(data)]
    );

    res.json({ success: true, data });
  } catch (error: any) {
    securityLog.error('Error triggering wallet reconciliation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getUniversalIdempotencyRecords = async (req: Request, res: Response): Promise<void> => {
  try {
    const { service_name, operation_type, idempotency_key, limit = 50, offset = 0 } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (service_name) {
      conditions.push(`service_name = $${idx++}`);
      params.push(service_name);
    }
    if (operation_type) {
      conditions.push(`operation_type = $${idx++}`);
      params.push(operation_type);
    }
    if (idempotency_key) {
      conditions.push(`idempotency_key = $${idx++}`);
      params.push(idempotency_key);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const queryStr = `
      SELECT id, idempotency_key, service_name, operation_type, request_hash, status_code, created_at, expires_at
      FROM universal_idempotency_records
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(Number(limit), Number(offset));

    const result = await readDb.query(queryStr, params);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error fetching universal idempotency records:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getReconciliationSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const service = String(req.query.service || '').trim();
    const provider = String(req.query.provider || '').trim();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const filters: string[] = [];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (service) filters.push(`COALESCE(o.service_sub_type, 'parcel') = ${addParam(service)}`);
    if (provider) filters.push(`COALESCE(o.logistics_provider, '') = ${addParam(provider)}`);
    if (from) filters.push(`o.created_at >= ${addParam(from)}::date`);
    if (to) filters.push(`o.created_at < (${addParam(to)}::date + INTERVAL '1 day')`);
    const orderFilter = filters.length ? ` AND ${filters.join(' AND ')}` : '';

    // All amounts below use the canonical columns from the active migrations.
    // The previous implementation referenced total_amount/amount and silently
    // failed against the current schema.
    const orderPaymentRes = await readDb.query(`
      SELECT COALESCE(SUM(o.total_price_idr), 0)::bigint AS expected_idr,
             COALESCE(SUM(p.amount_idr) FILTER (WHERE LOWER(p.status::text) IN ('paid', 'settled')), 0)::bigint AS actual_idr,
             COUNT(o.id)::int AS order_count,
             COUNT(p.id) FILTER (WHERE LOWER(p.status::text) IN ('paid', 'settled'))::int AS matched_count
      FROM orders o
      LEFT JOIN payments p ON p.order_id = o.id
      WHERE LOWER(o.status::text) IN ('delivered', 'completed', 'pod_completed')${orderFilter}
    `, params);

    const ledgerPaymentRes = await readDb.query(`
      SELECT COALESCE(SUM(e.debit_idr) FILTER (WHERE e.account_name IN ('cash_main', 'bank_disbursement_account')), 0)::bigint AS expected_idr,
             COALESCE(SUM(e.credit_idr) FILTER (WHERE e.account_name IN ('customer_payment', 'payment_clearing')), 0)::bigint AS actual_idr
      FROM ledger_entries e
      JOIN ledger_journals j ON j.id = e.journal_id
      LEFT JOIN payments p ON p.id::text = j.reference_id
      LEFT JOIN orders o ON o.id = p.order_id OR o.id::text = j.reference_id
      WHERE j.journal_type IN ('payment', 'order_payment', 'payment_settlement')${orderFilter}
    `, params);

    const courierRes = await readDb.query(`
      SELECT
        COALESCE((SELECT SUM(amount_idr) FROM courier_earnings_ledger
          WHERE direction = 'credit' AND settlement_status IN ('pending', 'available', 'held', 'requested', 'processing')), 0)::bigint AS expected_idr,
        COALESCE((SELECT SUM(net_amount_idr) FROM courier_payout_requests
          WHERE status = 'paid'), 0)::bigint AS actual_idr
    `);

    const settlementRes = await readDb.query(`
      SELECT
        COALESCE(SUM(ms.net_payout_idr), 0)::bigint AS expected_idr,
        COALESCE(SUM(mle.amount_idr) FILTER (WHERE mle.entry_type = 'SETTLEMENT_RELEASE' AND mle.status = 'POSTED'), 0)::bigint AS actual_idr,
        COUNT(ms.id)::int AS settlement_count
      FROM merchant_settlements ms
      JOIN orders o ON o.id = ms.order_id
      LEFT JOIN merchant_settlement_ledger_entries mle ON mle.settlement_id = ms.id
      WHERE LOWER(ms.status::text) IN ('holding', 'processing', 'completed', 'disputed')${orderFilter}
    `, params);

    const providerRes = await readDb.query(`
      SELECT
        COALESCE(SUM(COALESCE(o.logistics_net_cost_idr, 0)), 0)::bigint AS expected_idr,
        COALESCE(SUM(pii.claimed_amount_idr), 0)::bigint AS actual_idr
      FROM orders o
      LEFT JOIN provider_invoice_items pii ON pii.order_id = o.id
      WHERE LOWER(o.status::text) IN ('delivered', 'completed', 'pod_completed')
        AND o.logistics_provider IS NOT NULL${orderFilter}
    `, params);

    const promoRes = await readDb.query(`
      SELECT
        COALESCE(SUM(o.promo_subsidy_idr), 0)::bigint AS expected_idr,
        COALESCE(SUM(pr.discount_idr), 0)::bigint AS actual_idr
      FROM orders o
      LEFT JOIN promo_redemptions pr ON pr.order_id = o.id AND pr.status = 'redeemed'
      WHERE LOWER(o.status::text) IN ('delivered', 'completed', 'pod_completed')${orderFilter}
    `, params);

    const voucherRes = await readDb.query(`
      SELECT
        COALESCE(SUM(o.discount_idr), 0)::bigint AS expected_idr,
        COALESCE(SUM(vu.discount_idr), 0)::bigint AS actual_idr
      FROM orders o
      LEFT JOIN voucher_usages vu ON vu.order_id = o.id
      WHERE LOWER(o.status::text) IN ('delivered', 'completed', 'pod_completed')${orderFilter}
    `, params);

    const platformFeeRes = await readDb.query(`
      SELECT
        COALESCE(SUM(o.platform_fee_idr), 0)::bigint AS expected_idr,
        COALESCE((SELECT SUM(e.credit_idr) FROM ledger_entries e
          JOIN ledger_journals j ON j.id = e.journal_id
          LEFT JOIN payments p ON p.id::text = j.reference_id
          WHERE j.journal_type IN ('payment', 'order_payment', 'payment_settlement')
            AND e.account_name = 'platform_fee_revenue'
            AND (p.order_id = o.id OR j.reference_id = o.id::text)), 0)::bigint AS actual_idr
      FROM orders o
      WHERE LOWER(o.status::text) IN ('delivered', 'completed', 'pod_completed')${orderFilter}
    `, params);

    const refundRes = await readDb.query(`
      SELECT
        COALESCE(SUM(r.amount_idr), 0)::bigint AS expected_idr,
        COALESCE(SUM(e.credit_idr) FILTER (WHERE e.account_name = 'customer_refund_payable'), 0)::bigint AS actual_idr
      FROM refunds r
      JOIN orders o ON o.id = r.order_id
      LEFT JOIN ledger_journals j ON j.reference_id = o.id::text AND j.journal_type IN ('refund', 'order_refund')
      LEFT JOIN ledger_entries e ON e.journal_id = j.id
      WHERE LOWER(r.status::text) IN ('processed', 'processing', 'refunded')${orderFilter}
    `, params);

    const taxRes = await readDb.query(`
      SELECT
        COALESCE(SUM(o.ppn_idr), 0)::bigint AS expected_idr,
        COALESCE((SELECT SUM(te.total_ppn_idr) FROM tax_efaktur_exports te
          WHERE te.status IN ('exported', 'submitted', 'accepted')), 0)::bigint AS actual_idr
      FROM orders o
      WHERE LOWER(o.status::text) IN ('delivered', 'completed', 'pod_completed')${orderFilter}
    `, params);

    const rows = [
      { name: 'payment_vs_order', row: orderPaymentRes.rows[0] },
      { name: 'ledger_vs_payment', row: ledgerPaymentRes.rows[0] },
      { name: 'courier_payable_vs_payout', row: courierRes.rows[0] },
      { name: 'merchant_settlement_vs_release', row: settlementRes.rows[0] },
      { name: 'provider_cost_vs_invoice', row: providerRes.rows[0] },
      { name: 'promo_subsidy_vs_redemption', row: promoRes.rows[0] },
      { name: 'voucher_discount_vs_usage', row: voucherRes.rows[0] },
      { name: 'platform_fee_vs_ledger', row: platformFeeRes.rows[0] },
      { name: 'refund_vs_ledger', row: refundRes.rows[0] },
      { name: 'tax_snapshot_vs_efaktur', row: taxRes.rows[0] },
    ].map(({ name, row }) => {
      const expected = Number(row?.expected_idr || 0);
      const actual = Number(row?.actual_idr || 0);
      const difference = actual - expected;
      return {
        name,
        expected_idr: expected,
        actual_idr: actual,
        discrepancy_idr: difference,
        status: difference === 0 ? 'balanced' : 'mismatch',
        matched_count: difference === 0 ? 1 : 0,
        mismatches: difference === 0 ? 0 : 1,
      };
    });

    // A mismatch is durable operational evidence, not just a red badge in
    // the UI. The deterministic key makes repeated dashboard loads safe and
    // preserves the original ledger history.
    for (const row of rows.filter((item) => item.mismatches > 0)) {
      const exceptionKey = [row.name, service || 'all-services', provider || 'all-providers', from || 'all-time', to || 'all-time'].join(':');
      await db.query(`
        INSERT INTO finance_reconciliation_exceptions (
          exception_key, service_sub_type, provider, reference_type,
          reference_id, expected_idr, actual_idr, difference_idr, reason,
          metadata, first_seen_at, last_seen_at
        ) VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), 'finance_reconciliation',
          $4, $5, $6, $7, $8, $9::jsonb, NOW(), NOW())
        ON CONFLICT (exception_key) DO UPDATE SET
          expected_idr = EXCLUDED.expected_idr,
          actual_idr = EXCLUDED.actual_idr,
          difference_idr = EXCLUDED.difference_idr,
          last_seen_at = NOW(),
          metadata = EXCLUDED.metadata,
          status = CASE WHEN finance_reconciliation_exceptions.status = 'resolved'
            THEN finance_reconciliation_exceptions.status ELSE 'open' END
      `, [
        exceptionKey, service, provider, row.name, row.expected_idr,
        row.actual_idr, row.discrepancy_idr,
        `Reconciliation mismatch in ${row.name}`,
        JSON.stringify({ service, provider, from, to }),
      ]);
    }

    res.json({ success: true, data: rows, filters: { service, provider, from, to }, checkedAt: new Date().toISOString() });
  } catch (error: any) {
    securityLog.error('Error fetching reconciliation summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
