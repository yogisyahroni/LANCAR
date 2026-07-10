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
    // 1. Pembayaran vs Order
    const orderPaymentRes = await readDb.query(`
      SELECT 
        COUNT(o.id) as total_delivered_orders,
        COALESCE(SUM(o.total_amount), 0) as total_delivered_amount,
        COUNT(p.id) as matched_payments,
        COALESCE(SUM(p.amount), 0) as total_paid_amount
      FROM orders o
      LEFT JOIN payments p ON o.id = p.order_id AND p.status IN ('COMPLETED', 'PAID', 'SUCCESS')
      WHERE o.status = 'delivered'
    `);

    // 2. Ledger vs Payment
    const ledgerPaymentRes = await readDb.query(`
      SELECT 
        COALESCE(SUM(e.debit_idr), 0) as total_ledger_cash_debit,
        COALESCE(SUM(e.credit_idr), 0) as total_ledger_cash_credit
      FROM ledger_entries e
      WHERE e.account_name ILIKE '%1101%' OR e.account_name ILIKE '%Kas%' OR e.account_name ILIKE '%Bank%'
    `);

    // 3. Courier Payable vs Payout
    const courierPayableRes = await readDb.query(`
      SELECT 
        COALESCE(SUM(balance), 0) as total_courier_wallet_balance
      FROM courier_wallets
    `);
    const courierPayoutsRes = await readDb.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_payouts_completed
      FROM courier_payouts
      WHERE status = 'COMPLETED'
    `);

    // 4. Merchant Settlement vs Escrow
    const settlementEscrowRes = await readDb.query(`
      SELECT 
        COUNT(*) as pending_settlements,
        COALESCE(SUM(net_payout_amount), 0) as total_pending_payout
      FROM merchant_settlements
      WHERE settlement_status IN ('PENDING', 'PROCESSING', 'APPROVED')
    `);

    // 5. Provider Cost vs Aggregator Invoice
    const providerCostRes = await readDb.query(`
      SELECT 
        COALESCE(SUM(provider_cost_idr), 0) as total_provider_cost
      FROM orders
      WHERE status = 'delivered'
    `);

    // 6. Tax Snapshot vs eFaktur
    const taxSnapshotRes = await readDb.query(`
      SELECT 
        COUNT(*) as orders_with_ppn,
        COALESCE(SUM(ppn_idr), 0) as total_ppn_snapshot
      FROM orders
      WHERE status = 'delivered' AND ppn_idr IS NOT NULL AND ppn_idr > 0
    `);

    res.json({
      success: true,
      data: {
        pembayaranVsOrder: orderPaymentRes.rows[0],
        ledgerVsPayment: ledgerPaymentRes.rows[0],
        courierPayableVsPayout: {
          courierWalletBalance: Number(courierPayableRes.rows[0]?.total_courier_wallet_balance || 0),
          completedPayouts: Number(courierPayoutsRes.rows[0]?.total_payouts_completed || 0),
        },
        merchantSettlement: settlementEscrowRes.rows[0],
        providerCostVsInvoice: providerCostRes.rows[0],
        taxSnapshotVsEfaktur: taxSnapshotRes.rows[0],
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    securityLog.error('Error fetching reconciliation summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
