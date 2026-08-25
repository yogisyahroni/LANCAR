import { db } from '../db';
import { createNotification } from '../notifications';
import { recordRealtimeMetric, realtimeStructuredLog } from './realtimeObservability';
import {
  BroadcastTargetType,
  DEFAULT_TARGET_BATCH_SIZE,
  estimateCount,
  iterateTargetBatches,
} from './broadcastTarget.service';
import { getMaxRecipientsPerBroadcast } from './broadcast.service';
import { securityLog } from '../security/logRedaction';

const RECIPIENT_INSERT_BATCH_SIZE = 500;
const DELIVERY_SCAN_BATCH_SIZE = 500;

const resolvePositiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const SEND_CONCURRENCY = resolvePositiveInt(process.env.BROADCAST_SEND_CONCURRENCY, 25);

interface BroadcastRow {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  deep_link: string | null;
  category: 'system' | 'promo' | 'support' | 'activity' | 'message';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  channels: unknown;
  target_type: BroadcastTargetType;
  target_filter: unknown;
}

export interface ClaimResult {
  ok: boolean;
  reason?: string;
  status?: string | null;
}

/**
 * CAS claim: exactly one caller wins per broadcast. Any concurrent send
 * (HTTP double-click, scheduler on another replica) loses here and bails.
 */
export const claimBroadcastForSending = async (broadcastId: string): Promise<ClaimResult> => {
  const claim = await db.query(
    `UPDATE broadcasts
     SET status = 'sending', updated_at = NOW()
     WHERE id = $1 AND status IN ('draft', 'scheduled')
     RETURNING *`,
    [broadcastId],
  );

  if (claim.rowCount === 0) {
    const current = await db.query<{ status: string }>(
      'SELECT status FROM broadcasts WHERE id = $1',
      [broadcastId],
    );
    const status = current.rows[0]?.status;
    return {
      ok: false,
      status: status || null,
      reason: status ? `broadcast_not_sendable_status_${status}` : 'broadcast_not_found',
    };
  }
  return { ok: true };
};

const normalizeChannels = (channels: unknown): string[] => {
  const list = Array.isArray(channels)
    ? channels.map((c) => String(c).trim().toLowerCase())
    : [];
  const normalized = list.includes('fcm') && !list.includes('push')
    ? [...list.filter((c) => c !== 'fcm'), 'push']
    : list;
  const wantsPush = normalized.includes('push');
  const wantsInApp = normalized.length === 0 || normalized.includes('in_app');
  if (wantsPush && wantsInApp) return ['push_and_in_app'];
  if (wantsPush) return ['push'];
  return ['in_app'];
};

const insertRecipientBatch = async (
  broadcastId: string,
  userIds: string[],
  channel: string,
): Promise<number> => {
  const result = await db.query(
    `INSERT INTO broadcast_recipients (broadcast_id, user_id, channel, status)
     SELECT $1, uid, $2, 'pending'
     FROM unnest($3::uuid[]) AS t(uid)
     ON CONFLICT (broadcast_id, user_id) DO NOTHING`,
    [broadcastId, channel, userIds],
  );
  return result.rowCount || 0;
};

const markRecipientStatuses = async (
  broadcastId: string,
  sentIds: string[],
  failedEntries: Array<{ userId: string; errorCode: string }>,
) => {
  if (sentIds.length > 0) {
    await db.query(
      `UPDATE broadcast_recipients
       SET status = 'sent', sent_at = NOW()
       WHERE broadcast_id = $1 AND user_id = ANY($2::uuid[]) AND status = 'pending'`,
      [broadcastId, sentIds],
    );
  }
  for (const entry of failedEntries) {
    await db.query(
      `UPDATE broadcast_recipients
       SET status = 'failed', error_code = $2
       WHERE broadcast_id = $1 AND user_id = $3::uuid AND status = 'pending'`,
      [broadcastId, entry.errorCode.slice(0, 250), entry.userId],
    );
  }
};

/** Core delivery loop. Assumes the broadcast row is already claimed as 'sending'. */
const runDeliveryLoop = async (broadcast: BroadcastRow): Promise<void> => {
  const broadcastId = broadcast.id;
  const channelLabel = normalizeChannels(broadcast.channels)[0] || 'in_app';
  const cap = getMaxRecipientsPerBroadcast();

  // ── 1. Resolve targets into recipient rows (batched, never fully in memory) ──
  let totalTargets = 0;
  if (broadcast.target_type === 'manual') {
    const filter =
      broadcast.target_filter && typeof broadcast.target_filter === 'object'
        ? (broadcast.target_filter as { user_ids?: string[] })
        : {};
    const manualIds = Array.from(
      new Set((Array.isArray(filter.user_ids) ? filter.user_ids : []).map((id) => String(id))),
    );
    if (manualIds.length > cap) {
      throw Object.assign(
        new Error(`Manual audience ${manualIds.length} exceeds recipient cap ${cap}`),
        { statusCode: 400 },
      );
    }
    for (let i = 0; i < manualIds.length; i += RECIPIENT_INSERT_BATCH_SIZE) {
      totalTargets += await insertRecipientBatch(
        broadcastId,
        manualIds.slice(i, i + RECIPIENT_INSERT_BATCH_SIZE),
        channelLabel,
      );
    }
  } else {
    const estimated = await estimateCount(broadcast.target_type, broadcast.target_filter);
    if (estimated > cap) {
      throw Object.assign(
        new Error(`Estimated audience ${estimated} exceeds recipient cap ${cap}`),
        { statusCode: 400 },
      );
    }
    for await (const batch of iterateTargetBatches(
      broadcast.target_type,
      broadcast.target_filter,
      DEFAULT_TARGET_BATCH_SIZE,
    )) {
      totalTargets += await insertRecipientBatch(broadcastId, batch, channelLabel);
      if (totalTargets > cap) {
        throw Object.assign(
          new Error(`Resolved audience exceeded recipient cap mid-flight (${cap})`),
          { statusCode: 400 },
        );
      }
    }
  }

  await db.query('UPDATE broadcasts SET total_targets = $2 WHERE id = $1', [
    broadcastId,
    totalTargets,
  ]);

  // ── 2. Deliver to pending recipients in scan batches ──
  let sentCount = 0;
  let failedCount = 0;
  let lastRecipientId = '0';

  for (;;) {
    const pending = await db.query<{ id: string; user_id: string }>(
      `SELECT id::text AS id, user_id::text AS user_id
       FROM broadcast_recipients
       WHERE broadcast_id = $1 AND status = 'pending' AND id > $2
       ORDER BY id ASC
       LIMIT $3`,
      [broadcastId, lastRecipientId, DELIVERY_SCAN_BATCH_SIZE],
    );
    if (pending.rows.length === 0) break;
    lastRecipientId = pending.rows[pending.rows.length - 1].id;

    const sentIds: string[] = [];
    const failedEntries: Array<{ userId: string; errorCode: string }> = [];

    for (let i = 0; i < pending.rows.length; i += SEND_CONCURRENCY) {
      const chunk = pending.rows.slice(i, i + SEND_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((row) =>
          createNotification({
            user_id: row.user_id,
            title: broadcast.title,
            body: broadcast.body,
            type: 'broadcast',
            category: broadcast.category,
            priority: broadcast.priority,
            deep_link: broadcast.deep_link || undefined,
            metadata: {
              broadcast_id: broadcastId,
              ...(broadcast.image_url ? { image_url: broadcast.image_url } : {}),
            },
          }),
        ),
      );

      results.forEach((outcome, idx) => {
        const row = chunk[idx];
        if (outcome.status === 'fulfilled') {
          sentIds.push(row.user_id);
        } else {
          failedEntries.push({
            userId: row.user_id,
            errorCode:
              outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
          });
        }
      });
    }

    await markRecipientStatuses(broadcastId, sentIds, failedEntries);
    sentCount += sentIds.length;
    failedCount += failedEntries.length;
  }

  // ── 3. Final aggregate counters from source of truth ──
  const aggregate = await db.query<{
    total: string;
    delivered: string;
    failed: string;
  }>(
    `SELECT COUNT(*)::TEXT AS total,
            COUNT(*) FILTER (WHERE status IN ('sent','opened'))::TEXT AS delivered,
            COUNT(*) FILTER (WHERE status = 'failed')::TEXT AS failed
     FROM broadcast_recipients
     WHERE broadcast_id = $1`,
    [broadcastId],
  );
  const finalTotal = Number.parseInt(aggregate.rows[0]?.total || '0', 10);
  const finalSent = Number.parseInt(aggregate.rows[0]?.delivered || '0', 10);
  const finalFailed = Number.parseInt(aggregate.rows[0]?.failed || '0', 10);

  await db.query(
    `UPDATE broadcasts
     SET status = 'sent', sent_at = NOW(),
         total_targets = $2, sent_count = $3, failed_count = $4
     WHERE id = $1 AND status = 'sending'`,
    [broadcastId, finalTotal, finalSent, finalFailed],
  );

  void recordRealtimeMetric('broadcast_sent_total', {
    target_type: broadcast.target_type,
    category: broadcast.category,
  }, finalSent);
  void recordRealtimeMetric('broadcast_failed_total', {
    target_type: broadcast.target_type,
    category: broadcast.category,
  }, finalFailed);

  securityLog.info('[Broadcast] Delivery completed', {
    broadcast_id: broadcastId,
    total_targets: finalTotal,
    sent_count: finalSent,
    failed_count: finalFailed,
  });
};

const failBroadcast = async (broadcastId: string, error: unknown) => {
  try {
    await db.query(
      `UPDATE broadcasts SET status = 'failed' WHERE id = $1 AND status = 'sending'`,
      [broadcastId],
    );
  } catch (markError) {
    realtimeStructuredLog('error', 'broadcast_fail_mark_failed', {
      broadcast_id: broadcastId,
      message: markError instanceof Error ? markError.message : String(markError),
    });
  }
  realtimeStructuredLog('error', 'broadcast_delivery_failed', {
    broadcast_id: broadcastId,
    message: error instanceof Error ? error.message : String(error),
  });
};

/**
 * Full synchronous send: CAS claim → deliver → finalize.
 * Used by the scheduler worker.
 */
export const sendBroadcast = async (
  broadcastId: string,
): Promise<ClaimResult & { sent_count?: number; failed_count?: number }> => {
  const claimed = await claimBroadcastForSending(broadcastId);
  if (!claimed.ok) return claimed;

  const current = await db.query<BroadcastRow>('SELECT * FROM broadcasts WHERE id = $1', [
    broadcastId,
  ]);
  if (current.rows.length === 0) return { ok: false, reason: 'broadcast_not_found' };

  try {
    await runDeliveryLoop(current.rows[0]);
    const after = await db.query<{ sent_count: number; failed_count: number }>(
      'SELECT sent_count, failed_count FROM broadcasts WHERE id = $1',
      [broadcastId],
    );
    return {
      ok: true,
      sent_count: after.rows[0]?.sent_count,
      failed_count: after.rows[0]?.failed_count,
    };
  } catch (error) {
    await failBroadcast(broadcastId, error);
    return { ok: false, reason: 'delivery_failed' };
  }
};

/**
 * Fire-and-forget dispatch for HTTP handlers: claims synchronously so the
 * request can confirm start, then continues detached.
 */
export const dispatchBroadcastAsync = async (broadcastId: string): Promise<ClaimResult> => {
  const claimed = await claimBroadcastForSending(broadcastId);
  if (!claimed.ok) return claimed;

  void (async () => {
    try {
      const current = await db.query<BroadcastRow>('SELECT * FROM broadcasts WHERE id = $1', [
        broadcastId,
      ]);
      if (current.rows.length === 0) return;
      await runDeliveryLoop(current.rows[0]);
    } catch (error) {
      await failBroadcast(broadcastId, error);
    }
  })();

  return { ok: true, status: 'sending' };
};
