import { Request, Response } from 'express';
import { db } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * ECON-2026-007: compensate a customer through the authoritative wallet
 * ledger. This deliberately never changes orders.total_price_idr or a refund
 * amount; the credit is a separate, auditable financial event.
 */
export const createCustomerFeeCredit = async (req: Request, res: Response): Promise<void> => {
  const customerId = String(req.body?.customer_id || '').trim();
  const orderId = String(req.body?.order_id || '').trim();
  const amountIdr = Number(req.body?.amount_idr);
  const reason = String(req.body?.reason || '').trim();
  const policyReference = String(req.body?.policy_reference || '').trim();
  const actorId = getActorId(req);

  if (!UUID_RE.test(customerId) || !UUID_RE.test(orderId)) {
    res.status(400).json({ success: false, error: 'customer_id dan order_id harus UUID valid' });
    return;
  }
  if (!Number.isSafeInteger(amountIdr) || amountIdr <= 0 || amountIdr > 100_000_000) {
    res.status(400).json({ success: false, error: 'amount_idr harus bilangan positif yang valid' });
    return;
  }
  if (reason.length < 10 || reason.length > 500 || policyReference.length < 3 || policyReference.length > 160) {
    res.status(400).json({ success: false, error: 'reason dan policy_reference wajib diisi secara memadai' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Serialize credits per customer even on deployments where historical
    // wallet data contains more than one active wallet row.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [customerId]);

    const existing = await client.query(
      `SELECT id, amount_idr, balance_after_idr, metadata, created_at
         FROM customer_wallet_ledger_entries
        WHERE idempotency_key = $1
        FOR SHARE`,
      [`customer-fee-credit:${orderId}:${policyReference}`],
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      res.json({ success: true, replayed: true, data: existing.rows[0] });
      return;
    }

    const orderResult = await client.query(
      `SELECT o.id, o.customer_id, o.status, r.cancellation_fee_idr,
              r.status AS refund_status
         FROM orders o
         JOIN refunds r ON r.order_id = o.id
        WHERE o.id = $1 AND o.customer_id = $2
        ORDER BY r.created_at DESC
        LIMIT 1
        FOR UPDATE OF o, r`,
      [orderId, customerId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Order customer atau refund tidak ditemukan' });
      return;
    }
    const cancellationFeeIDR = Number(order.cancellation_fee_idr || 0);
    if (order.status !== 'cancelled' || order.refund_status !== 'processed' || cancellationFeeIDR <= 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Hanya fee pembatalan yang sudah diproses yang dapat diberi kompensasi' });
      return;
    }
    if (amountIdr > cancellationFeeIDR) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Kredit melebihi cancellation fee yang benar-benar ditagihkan' });
      return;
    }

    let walletResult = await client.query(
      `SELECT id, balance
         FROM customer_wallets
        WHERE customer_id = $1 AND status = 'active'
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        FOR UPDATE`,
      [customerId],
    );
    if (!walletResult.rows[0]) {
      walletResult = await client.query(
        `INSERT INTO customer_wallets (customer_id, balance, status)
         VALUES ($1, 0, 'active')
         RETURNING id, balance`,
        [customerId],
      );
    }
    const wallet = walletResult.rows[0];
    const balanceAfterIDR = Number(wallet.balance || 0) + amountIdr;
    const idempotencyKey = `customer-fee-credit:${orderId}:${policyReference}`;
    const metadata = {
      credit_type: 'customer_cancellation_fee_waiver',
      policy_reference: policyReference,
      reason,
      actor_id: actorId,
      cancellation_fee_idr: cancellationFeeIDR,
    };
    const ledgerResult = await client.query(
      `INSERT INTO customer_wallet_ledger_entries (
          customer_id, wallet_id, order_id, idempotency_key, entry_type,
          direction, amount_idr, balance_after_idr, metadata
       ) VALUES ($1, $2, $3, $4, 'customer_fee_credit', 'credit', $5, $6, $7::jsonb)
       RETURNING id, amount_idr, balance_after_idr, metadata, created_at`,
      [customerId, wallet.id, orderId, idempotencyKey, amountIdr, balanceAfterIDR, JSON.stringify(metadata)],
    );
    await client.query(
      `UPDATE customer_wallets SET balance = $2, updated_at = NOW() WHERE id = $1`,
      [wallet.id, balanceAfterIDR],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, 'customer.cancellation_fee.credit', $2, $3)`,
      [actorId, orderId, JSON.stringify({ customer_id: customerId, amount_idr: amountIdr, policy_reference: policyReference, reason })],
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: ledgerResult.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('[customerFeeCredits] create error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};
