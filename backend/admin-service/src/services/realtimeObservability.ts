import { redis } from '../redis';

type Queryable = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

type RealtimeMetricTags = Record<string, string | number | boolean | null | undefined>;

const safeTag = (value: unknown) => String(value ?? 'unknown').replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80);

const minuteBucket = () => {
  const now = new Date();
  now.setSeconds(0, 0);
  return now.toISOString();
};

export const realtimeStructuredLog = (
  level: 'info' | 'warn' | 'error',
  event: string,
  payload: Record<string, unknown>,
) => {
  const line = {
    timestamp: new Date().toISOString(),
    service: 'admin-service',
    domain: 'on_demand_realtime',
    event,
    ...payload,
  };

  const message = JSON.stringify(line);
  if (level === 'error') {
    console.error(message);
  } else if (level === 'warn') {
    console.warn(message);
  } else {
    console.log(message);
  }
};

export const recordRealtimeMetric = async (
  metric: string,
  tags: RealtimeMetricTags = {},
  value = 1,
) => {
  const normalizedTags = Object.fromEntries(
    Object.entries(tags).filter(([, tagValue]) => tagValue !== undefined),
  );

  realtimeStructuredLog('info', 'metric_recorded', {
    metric,
    value,
    tags: normalizedTags,
  });

  try {
    const tagKey = Object.entries(normalizedTags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, tagValue]) => `${safeTag(key)}=${safeTag(tagValue)}`)
      .join('|') || 'default';
    const key = `metrics:on_demand_realtime:${safeTag(metric)}:${minuteBucket()}:${tagKey}`;
    await redis.incrbyfloat(key, value);
    await redis.expire(key, 60 * 60 * 24);
  } catch (error) {
    realtimeStructuredLog('warn', 'metric_redis_write_failed', {
      metric,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const recordRealtimeEventDelivery = (
  event: string,
  payload: {
    order_id?: string | null;
    customer_id?: string | null;
    courier_user_id?: string | null;
    stage?: string | null;
    location?: { timestamp?: string | null } | null;
  },
) => {
  void recordRealtimeMetric('event_emitted', {
    event,
    stage: payload.stage || null,
    has_customer: Boolean(payload.customer_id),
    has_courier: Boolean(payload.courier_user_id),
  });

  if (event === 'tracking_updated' && payload.location?.timestamp) {
    const latencyMs = Date.now() - new Date(payload.location.timestamp).getTime();
    if (Number.isFinite(latencyMs) && latencyMs >= 0) {
      void recordRealtimeMetric('tracking_emit_latency_ms', {
        event,
        stage: payload.stage || null,
      }, latencyMs);
      if (latencyMs > Number(process.env.ON_DEMAND_TRACKING_LATENCY_WARN_MS || 30000)) {
        realtimeStructuredLog('warn', 'tracking_emit_latency_high', {
          order_id: payload.order_id || null,
          latency_ms: latencyMs,
          threshold_ms: Number(process.env.ON_DEMAND_TRACKING_LATENCY_WARN_MS || 30000),
        });
      }
    }
  }
};

export const recordPushDelivery = (payload: {
  user_id: string;
  type: string;
  order_id?: string | null;
  device_count: number;
  success_count: number;
  failure_count: number;
  skipped_reason?: string | null;
}) => {
  void recordRealtimeMetric('push_delivery', {
    type: payload.type,
    skipped_reason: payload.skipped_reason || null,
    has_order: Boolean(payload.order_id),
  }, payload.success_count);

  if (payload.failure_count > 0 || payload.skipped_reason) {
    realtimeStructuredLog(payload.failure_count > 0 ? 'warn' : 'info', 'push_delivery_attention', {
      user_id: payload.user_id,
      type: payload.type,
      order_id: payload.order_id || null,
      device_count: payload.device_count,
      success_count: payload.success_count,
      failure_count: payload.failure_count,
      skipped_reason: payload.skipped_reason || null,
    });
  }
};

const writeOrderRealtimeAlert = async (
  client: Queryable,
  orderId: string,
  alertType: string,
  severity: 'warning' | 'critical',
  metadata: Record<string, unknown>,
) => {
  await client.query(
    `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
     SELECT $1, NULL, 'realtime_observability_alert', $2, $3
     WHERE NOT EXISTS (
       SELECT 1
       FROM order_events
       WHERE order_id = $1
         AND event_type = 'realtime_observability_alert'
         AND metadata->>'alert_type' = $4
         AND created_at >= NOW() - INTERVAL '15 minutes'
     )`,
    [
      orderId,
      severity === 'critical'
        ? 'Critical realtime delivery issue detected'
        : 'Realtime delivery issue detected',
      JSON.stringify({ alert_type: alertType, severity, ...metadata }),
      alertType,
    ],
  );

  realtimeStructuredLog(severity === 'critical' ? 'error' : 'warn', 'order_realtime_alert', {
    order_id: orderId,
    alert_type: alertType,
    severity,
    metadata,
  });
};

export const evaluateOnDemandRealtimeAlerts = async (client: Queryable) => {
  const trackingStaleMinutes = Number(process.env.ON_DEMAND_TRACKING_STALE_ALERT_MINUTES || 5);
  const acceptedNoUpdateMinutes = Number(process.env.ON_DEMAND_ACCEPTED_NO_UPDATE_ALERT_MINUTES || 2);

  try {
    const [staleTracking, acceptedWithoutLocation] = await Promise.all([
      client.query(
        `SELECT o.id AS order_id,
                o.status,
                MAX(cl.recorded_at) AS last_location_at
         FROM orders o
         JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
         LEFT JOIN courier_profiles cp ON cp.user_id = ol.courier_id
         LEFT JOIN courier_locations cl ON cl.order_id = o.id AND cl.courier_id = cp.id AND COALESCE(cl.is_spoofed, FALSE) = FALSE
         WHERE LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
           AND o.status IN ('accepted', 'picked_up', 'in_transit')
           AND ol.courier_id IS NOT NULL
         GROUP BY o.id, o.status
         HAVING MAX(cl.recorded_at) IS NOT NULL
            AND MAX(cl.recorded_at) < NOW() - ($1::text || ' minutes')::interval
         LIMIT 10`,
        [trackingStaleMinutes],
      ),
      client.query(
        `SELECT o.id AS order_id,
                o.status,
                o.updated_at
         FROM orders o
         JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
         LEFT JOIN courier_profiles cp ON cp.user_id = ol.courier_id
         LEFT JOIN courier_locations cl ON cl.order_id = o.id AND cl.courier_id = cp.id AND COALESCE(cl.is_spoofed, FALSE) = FALSE
         WHERE LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
           AND o.status = 'accepted'
           AND ol.courier_id IS NOT NULL
           AND o.updated_at < NOW() - ($1::text || ' minutes')::interval
           AND cl.id IS NULL
         LIMIT 10`,
        [acceptedNoUpdateMinutes],
      ),
    ]);

    for (const row of staleTracking.rows) {
      await writeOrderRealtimeAlert(client, row.order_id, 'tracking_update_stale', 'warning', {
        status: row.status,
        last_location_at: row.last_location_at,
        threshold_minutes: trackingStaleMinutes,
      });
    }

    for (const row of acceptedWithoutLocation.rows) {
      await writeOrderRealtimeAlert(client, row.order_id, 'accepted_without_customer_tracking_update', 'critical', {
        status: row.status,
        order_updated_at: row.updated_at,
        threshold_minutes: acceptedNoUpdateMinutes,
      });
    }
  } catch (error) {
    realtimeStructuredLog('warn', 'observability_check_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
