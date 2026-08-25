import { db } from '../db';
import { securityLog } from '../security/logRedaction';

export type ForceCancelRefundMode = 'none' | 'full' | 'partial';

export type ForceCancelRefundItem = {
  item_id: string;
  qty: number;
};

export type ForceCancelInput = {
  orderId: string;
  actorId: string;
  reason: string;
  refund_mode: ForceCancelRefundMode;
  refund_items?: ForceCancelRefundItem[];
  restock?: boolean;
};

export type ForceCancelResult = {
  order: {
    id: string;
    order_number: string | null;
    status: string;
    total_price_idr: number | null;
    updated_at: Date;
  };
  refund: {
    mode: ForceCancelRefundMode;
    triggered: boolean;
    amount_idr: number | null;
    error: string | null;
  };
  original_status: string;
};

// Status final — admin TIDAK boleh membatalkan ulang order yang sudah selesai,
// gagal permanen, atau sudah dibatalkan. Semua status in-flight lainnya
// (dispatching/offered/picking_up/delivering/dst) sah dibatalkan paksa karena
// ini memang alasan endpoint force-cancel ada (mirror aturan cancellable di
// customerOrder.controller.ts: status non-terminal saja yang boleh batal).
const TERMINAL_NON_CANCELLABLE_STATUSES = new Set([
  'cancelled',
  'failed',
  'completed',
  'delivered',
  'pod_completed',
]);

const orderServiceUrl = () => process.env.ORDER_SERVICE_URL || 'http://order-service:8080';

const internalHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Internal-Api-Key': process.env.INTERNAL_API_KEY || 'dev-internal-key-super-secret',
});

type RefundTriggerResult = { amountIdr: number | null; error: string | null };

// Refund full → /api/v1/internal/refunds/process (sama dengan cancelCustomerOrder).
// Refund partial per item → /api/v1/internal/refunds/items (sama dengan
// disputes.controller updateDisputeStatus FB-080).
const triggerRefund = async (
  input: ForceCancelInput,
  originalStatus: string,
): Promise<RefundTriggerResult> => {
  if (input.refund_mode === 'none') return { amountIdr: null, error: null };

  try {
    if (input.refund_mode === 'full') {
      const response = await fetch(`${orderServiceUrl()}/api/v1/internal/refunds/process`, {
        method: 'POST',
        headers: internalHeaders(),
        body: JSON.stringify({
          order_id: input.orderId,
          reason: `Force-cancel oleh admin: ${input.reason}`,
          original_status: originalStatus,
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        securityLog.error(
          `[ForceCancel] Full refund trigger failed (${response.status}) untuk order ${input.orderId}`,
          detail,
        );
        return { amountIdr: null, error: `refund_process_failed_${response.status}` };
      }
      const data = await response.json().catch(() => null);
      const amount = Number(data?.data?.amount_idr ?? data?.data?.AmountIDR ?? NaN);
      return { amountIdr: Number.isFinite(amount) ? amount : null, error: null };
    }

    const items = (input.refund_items || []).map((item) => ({
      menu_item_id: item.item_id,
      quantity: item.qty,
      reason: `Force-cancel oleh admin: ${input.reason}`,
    }));
    if (items.length === 0) {
      return { amountIdr: null, error: 'refund_items_required_for_partial_mode' };
    }

    const response = await fetch(`${orderServiceUrl()}/api/v1/internal/refunds/items`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify({
        order_id: input.orderId,
        items,
        include_delivery_fee: false,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      securityLog.error(
        `[ForceCancel] Item refund trigger failed (${response.status}) untuk order ${input.orderId}`,
        detail,
      );
      return { amountIdr: null, error: `refund_items_failed_${response.status}` };
    }
    const data = await response.json().catch(() => null);
    const amount = Number(data?.data?.amount_idr ?? data?.data?.AmountIDR ?? NaN);
    return { amountIdr: Number.isFinite(amount) ? amount : null, error: null };
  } catch (error: any) {
    securityLog.error('[ForceCancel] Failed to reach order-service for refund:', error.message);
    return { amountIdr: null, error: 'order_service_unreachable' };
  }
};

export const forceCancelOrder = async (input: ForceCancelInput): Promise<ForceCancelResult> => {
  const client = await db.connect();
  let originalStatus = '';

  try {
    await client.query('BEGIN');

    const { rows: orderRows } = await client.query(
      `SELECT id, status, order_number, service_sub_type, merchant_id
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [input.orderId],
    );

    if (orderRows.length === 0) {
      throw Object.assign(new Error('Order tidak ditemukan'), { statusCode: 404 });
    }

    originalStatus = String(orderRows[0].status || '');
    if (TERMINAL_NON_CANCELLABLE_STATUSES.has(originalStatus)) {
      throw Object.assign(
        new Error(
          `Order pada status "${originalStatus}" sudah final dan tidak dapat di-force-cancel.`,
        ),
        { statusCode: 409 },
      );
    }

    // Expire semua dispatch aktif agar kurir tidak lagi menerima offer order ini.
    await client.query(
      `UPDATE courier_offer_dispatches
       SET status = 'expired', updated_at = NOW()
       WHERE order_id = $1 AND status IN ('offered', 'pending')`,
      [input.orderId],
    );

    await client.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [input.orderId],
    );

    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, 'cancelled', $3, $4)`,
      [
        input.orderId,
        input.actorId,
        `Order dibatalkan paksa oleh admin (${input.actorId})`,
        JSON.stringify({
          reason: input.reason,
          cancelled_by: 'admin_force_cancel',
          refund_mode: input.refund_mode,
          refund_items_count: input.refund_items?.length || 0,
          restock_requested: Boolean(input.restock),
          original_status: originalStatus,
        }),
      ],
    );

    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        input.actorId,
        'order.force_cancel',
        input.orderId,
        JSON.stringify({
          reason: input.reason,
          refund_mode: input.refund_mode,
          refund_items_count: input.refund_items?.length || 0,
          restock_requested: Boolean(input.restock),
          original_status: originalStatus,
        }),
      ],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  // Refund dipicu SETELAH commit (pola sama dengan cancelCustomerOrder &
  // disputes.controller) supaya transaksi DB tidak menunggu HTTP upstream.
  const refund = await triggerRefund(input, originalStatus);

  const snapshotResult = await db.query(
    `SELECT id, order_number, status::text AS status, total_price_idr, updated_at
     FROM orders WHERE id = $1 LIMIT 1`,
    [input.orderId],
  );

  if (refund.amountIdr !== null) {
    await db
      .query(
        `INSERT INTO audit_logs (actor_id, action, target_id, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          input.actorId,
          'order.force_cancel.refund',
          input.orderId,
          JSON.stringify({
            refund_mode: input.refund_mode,
            amount_idr: refund.amountIdr,
            refund_error: refund.error,
          }),
        ],
      )
      .catch((auditError) =>
        securityLog.error('[ForceCancel] refund audit write failed:', auditError.message),
      );
  }

  return {
    order: snapshotResult.rows[0],
    refund: {
      mode: input.refund_mode,
      triggered: refund.error === null && input.refund_mode !== 'none',
      amount_idr: refund.amountIdr,
      error: refund.error,
    },
    original_status: originalStatus,
  };
};
