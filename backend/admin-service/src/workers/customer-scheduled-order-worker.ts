import { db } from '../db';
import { createNotification } from '../notifications';
import { advanceOnDemandDispatchQueue, notifyOnDemandOffers } from '../controllers/courierAuth.controller';

let started = false;
let running = false;

const workerId = `${process.env.HOSTNAME || 'admin-service'}:${process.pid}:customer-scheduled-order`;

const structuredLog = (
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
) => {
  console[level](JSON.stringify({ level, event, worker_id: workerId, ...fields }));
};

const resolvePositiveInt = (raw: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const processDueCustomerScheduledOrders = async () => {
  const client = await db.connect();
  const notifications: Array<{ customerId: string; orderId: string; orderNumber: string }> = [];
  try {
    await client.query('BEGIN');
    const due = await client.query<{
      id: string;
      customer_id: string;
      order_number: string;
    }>(
      `SELECT o.id, o.customer_id, o.order_number
         FROM orders o
        WHERE o.status = 'scheduled'
          AND o.schedule_type = 'scheduled'
          AND o.scheduled_at IS NOT NULL
          AND o.scheduled_at <= NOW()
          AND o.merchant_id IS NULL
          AND COALESCE(o.service_sub_type, '') <> 'food_delivery'
          AND LOWER(COALESCE(o.model, '')) IN ('p2p', 'on_demand', 'ondemand')
          AND EXISTS (
            SELECT 1 FROM payments p
             WHERE p.order_id = o.id AND p.status = 'paid'
          )
        ORDER BY o.scheduled_at ASC
        LIMIT $1
        FOR UPDATE OF o SKIP LOCKED`,
      [resolvePositiveInt(process.env.CUSTOMER_SCHEDULED_ORDER_BATCH_SIZE, 50)],
    );

    for (const order of due.rows) {
      const transitioned = await client.query(
        `UPDATE orders
            SET status = 'pending', updated_at = NOW()
          WHERE id = $1 AND status = 'scheduled'
        RETURNING id`,
        [order.id],
      );
      if (transitioned.rowCount !== 1) continue;

      await client.query(
        `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
         VALUES ($1, $2, 'scheduled_activated', 'Pickup terjadwal masuk antrean pencarian kurir', $3::jsonb)`,
        [order.id, order.customer_id, JSON.stringify({ source: 'customer_scheduled_order_worker' })],
      );
      notifications.push({
        customerId: order.customer_id,
        orderId: order.id,
        orderNumber: order.order_number,
      });
    }

    const createdOffers = notifications.length > 0
      ? await advanceOnDemandDispatchQueue(client, notifications.length)
      : [];
    await client.query('COMMIT');

    await notifyOnDemandOffers(createdOffers);
    await Promise.all(notifications.map((order) => createNotification({
      user_id: order.customerId,
      title: `Pickup dimulai - ${order.orderNumber}`,
      body: 'Pesanan terjadwal sudah masuk pencarian kurir.',
      type: 'order',
      order_id: order.orderId,
      deep_link: `/orders/${order.orderId}`,
      priority: 'normal',
      metadata: { source: 'customer_scheduled_order_worker', status: 'pending' },
    })));

    return { activated: notifications.length, offers: createdOffers.length };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const startCustomerScheduledOrderWorker = () => {
  if (started) return;
  started = true;

  if (process.env.CUSTOMER_SCHEDULED_ORDER_WORKER_ENABLED === 'false') {
    structuredLog('info', 'customer_scheduled_order_worker_disabled', {});
    return;
  }

  const intervalMs = Math.max(
    5000,
    resolvePositiveInt(process.env.CUSTOMER_SCHEDULED_ORDER_INTERVAL_MS, 60_000),
  );

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await processDueCustomerScheduledOrders();
      if (result.activated > 0) {
        structuredLog('info', 'customer_scheduled_order_worker_activated', result);
      }
    } catch (error) {
      structuredLog('error', 'customer_scheduled_order_worker_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  setTimeout(tick, Math.min(intervalMs, 10_000)).unref();
  setInterval(tick, intervalMs).unref();
  structuredLog('info', 'customer_scheduled_order_worker_started', { interval_ms: intervalMs });
};
