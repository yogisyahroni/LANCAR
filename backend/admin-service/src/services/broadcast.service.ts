import { db, readDb } from '../db';
import { redis } from '../redis';
import { securityLog } from '../security/logRedaction';

export type BroadcastCategory = 'system' | 'promo' | 'support' | 'activity' | 'message';
export type BroadcastPriority = 'low' | 'normal' | 'high' | 'urgent';
export type BroadcastTargetType = 'all' | 'online' | 'filter' | 'manual';
export type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const BROADCAST_CATEGORIES: BroadcastCategory[] = [
  'system',
  'promo',
  'support',
  'activity',
  'message',
];
export const BROADCAST_PRIORITIES: BroadcastPriority[] = ['low', 'normal', 'high', 'urgent'];
export const BROADCAST_TARGET_TYPES: BroadcastTargetType[] = ['all', 'online', 'filter', 'manual'];
export const BROADCAST_CHANNELS = ['push', 'in_app'];

const resolvePositiveInt = (raw: string | undefined, fallback: number, max: number): number => {
  const parsed = Number.parseInt(String(raw || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

/** BC-6: hard cap on audience size per broadcast (env-configurable). */
export const getMaxRecipientsPerBroadcast = (): number =>
  resolvePositiveInt(process.env.BROADCAST_MAX_RECIPIENTS, 20000, 1_000_000);

const SEND_RATE_LIMIT_PER_HOUR = resolvePositiveInt(
  process.env.BROADCAST_SEND_RATE_LIMIT_PER_HOUR,
  10,
  1000,
);
const SEND_WINDOW_SECONDS = 3600;

/**
 * BC-6: max 10 sends/hour/admin (Redis counter, keyed by admin id).
 * Fails open on Redis outage to match existing rateLimit.ts behaviour.
 */
export const consumeAdminBroadcastSendAllowance = async (adminId: string): Promise<boolean> => {
  try {
    const key = `rate_limit:broadcast_send:${adminId}`;
    const current = await redis.get(key);
    const currentCount = current ? Number.parseInt(current, 10) : 0;
    if (Number.isFinite(currentCount) && currentCount >= SEND_RATE_LIMIT_PER_HOUR) {
      return false;
    }
    const multi = redis.multi();
    multi.incr(key);
    if (!current) {
      multi.expire(key, SEND_WINDOW_SECONDS);
    }
    await multi.exec();
    return true;
  } catch (error) {
    securityLog.error('[Broadcast] Send rate limiter error (fail-open)', { error });
    return true;
  }
};

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value.trim());

export interface ValidatedBroadcastInput {
  title: string;
  body: string;
  image_url: string | null;
  deep_link: string | null;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  channels: string[];
  target_type: BroadcastTargetType;
  target_filter: Record<string, unknown> | null;
  status: 'draft' | 'scheduled';
  scheduled_at: Date | null;
}

const httpError = (statusCode: number, message: string): Error =>
  Object.assign(new Error(message), { statusCode });

const validateUrlField = (value: unknown, label: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048 || !/^https?:\/\//i.test(value)) {
    throw httpError(400, `${label} must be an http(s) URL of at most 2048 chars`);
  }
  return value;
};

const validateTargetFilter = (
  targetType: BroadcastTargetType,
  rawFilter: unknown,
): Record<string, unknown> | null => {
  if (targetType !== 'filter' && targetType !== 'manual') {
    if (rawFilter) return rawFilter as Record<string, unknown>;
    return null;
  }
  if (!rawFilter || typeof rawFilter !== 'object' || Array.isArray(rawFilter)) {
    throw httpError(400, `target_filter object is required for target_type '${targetType}'`);
  }
  return rawFilter as Record<string, unknown>;
};

const normalizeChannels = (rawChannels: unknown): string[] => {
  if (!Array.isArray(rawChannels) || rawChannels.length === 0) {
    return [...BROADCAST_CHANNELS];
  }
  const normalized = new Set<string>();
  for (const item of rawChannels) {
    const value = String(item).trim().toLowerCase();
    if (value === 'fcm') {
      normalized.add('push');
    } else if (BROADCAST_CHANNELS.includes(value)) {
      normalized.add(value);
    } else {
      throw httpError(
        400,
        `Invalid channel '${value}'. Allowed: ${BROADCAST_CHANNELS.join(', ')}`,
      );
    }
  }
  if (normalized.size === 0) normalized.add('in_app');
  return Array.from(normalized).sort();
};

export const validateBroadcastInput = (body: Record<string, unknown>): ValidatedBroadcastInput => {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!title || title.length > 60) {
    throw httpError(400, 'title is required and must be at most 60 characters');
  }
  if (!text || text.length > 500) {
    throw httpError(400, 'body is required and must be at most 500 characters');
  }

  const category = (typeof body.category === 'string' ? body.category : 'system') as BroadcastCategory;
  if (!BROADCAST_CATEGORIES.includes(category)) {
    throw httpError(400, `category must be one of ${BROADCAST_CATEGORIES.join(', ')}`);
  }

  const priority = (typeof body.priority === 'string' ? body.priority : 'normal') as BroadcastPriority;
  if (!BROADCAST_PRIORITIES.includes(priority)) {
    throw httpError(400, `priority must be one of ${BROADCAST_PRIORITIES.join(', ')}`);
  }

  const targetType = (typeof body.target_type === 'string'
    ? body.target_type
    : 'all') as BroadcastTargetType;
  if (!BROADCAST_TARGET_TYPES.includes(targetType)) {
    throw httpError(400, `target_type must be one of ${BROADCAST_TARGET_TYPES.join(', ')}`);
  }

  if (targetType === 'manual') {
    const userIds = (body.target_filter as { user_ids?: unknown })?.user_ids;
    if (!Array.isArray(userIds) || userIds.length === 0 || !userIds.every(isUuid)) {
      throw httpError(400, 'target_filter.user_ids must be a non-empty uuid array for manual targeting');
    }
    if (userIds.length > getMaxRecipientsPerBroadcast()) {
      throw httpError(
        400,
        `Manual audience exceeds recipient cap (${getMaxRecipientsPerBroadcast()})`,
      );
    }
  }

  const target_filter = validateTargetFilter(targetType, body.target_filter);

  let status: 'draft' | 'scheduled' = 'draft';
  let scheduled_at: Date | null = null;
  const requestedStatus = typeof body.status === 'string' ? body.status.toLowerCase() : 'draft';
  if (requestedStatus === 'scheduled') {
    status = 'scheduled';
    const rawScheduledAt = body.scheduled_at;
    scheduled_at = rawScheduledAt ? new Date(String(rawScheduledAt)) : null;
    if (!scheduled_at || Number.isNaN(scheduled_at.getTime()) || scheduled_at.getTime() <= Date.now()) {
      throw httpError(400, 'scheduled_at must be a future ISO timestamp when status=scheduled');
    }
  } else if (requestedStatus !== 'draft') {
    throw httpError(400, "status must be 'draft' or 'scheduled' on create");
  }

  return {
    title,
    body: text,
    image_url: validateUrlField(body.image_url, 'image_url'),
    deep_link: validateUrlField(body.deep_link, 'deep_link'),
    category,
    priority,
    channels: normalizeChannels(body.channels),
    target_type: targetType,
    target_filter,
    status,
    scheduled_at,
  };
};

export interface BroadcastListFilters {
  status?: string;
  category?: string;
  page: number;
  limit: number;
}

export const listBroadcasts = async (filters: BroadcastListFilters) => {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.status && filters.status !== 'all') {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }
  if (filters.category && filters.category !== 'all') {
    params.push(filters.category);
    clauses.push(`category = $${params.length}`);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.limit;

  const countRes = await readDb.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM broadcasts ${whereClause}`,
    params,
  );
  const total = Number.parseInt(countRes.rows[0]?.count || '0', 10);

  const dataRes = await readDb.query(
    `SELECT b.*, u.full_name AS created_by_name,
            (SELECT COUNT(*) FROM broadcast_recipients br WHERE br.broadcast_id = b.id)::INT AS recipient_rows
     FROM broadcasts b
     LEFT JOIN users u ON u.id = b.created_by
     ${whereClause}
     ORDER BY b.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filters.limit, offset],
  );

  return { rows: dataRes.rows, total };
};

export const getBroadcastById = async (broadcastId: string) => {
  const result = await readDb.query(
    `SELECT b.*, u.full_name AS created_by_name
     FROM broadcasts b
     LEFT JOIN users u ON u.id = b.created_by
     WHERE b.id = $1`,
    [broadcastId],
  );
  return result.rows[0] || null;
};

const SENDABLE_FOR_UPDATE_STATUSES: BroadcastStatus[] = ['draft', 'scheduled'];

export interface BroadcastPatch {
  title?: string;
  body?: string;
  image_url?: string | null;
  deep_link?: string | null;
  category?: BroadcastCategory;
  priority?: BroadcastPriority;
  channels?: string[];
  target_type?: BroadcastTargetType;
  target_filter?: Record<string, unknown> | null;
  status?: 'draft' | 'scheduled' | 'cancelled';
  scheduled_at?: Date | null;
}

/** Per-field validation for PATCH bodies (only provided fields are checked). */
export const validateBroadcastPatch = (body: Record<string, unknown>): BroadcastPatch => {
  const patch: BroadcastPatch = {};

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 60) throw httpError(400, 'title must be 1-60 characters');
    patch.title = title;
  }
  if (body.body !== undefined) {
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text || text.length > 500) throw httpError(400, 'body must be 1-500 characters');
    patch.body = text;
  }
  if (body.image_url !== undefined || body.image_url === null) {
    patch.image_url = validateUrlField(body.image_url, 'image_url');
  }
  if (body.deep_link !== undefined || body.deep_link === null) {
    patch.deep_link = validateUrlField(body.deep_link, 'deep_link');
  }
  if (body.category !== undefined) {
    const category = String(body.category) as BroadcastCategory;
    if (!BROADCAST_CATEGORIES.includes(category)) {
      throw httpError(400, `category must be one of ${BROADCAST_CATEGORIES.join(', ')}`);
    }
    patch.category = category;
  }
  if (body.priority !== undefined) {
    const priority = String(body.priority) as BroadcastPriority;
    if (!BROADCAST_PRIORITIES.includes(priority)) {
      throw httpError(400, `priority must be one of ${BROADCAST_PRIORITIES.join(', ')}`);
    }
    patch.priority = priority;
  }
  if (body.channels !== undefined) {
    patch.channels = normalizeChannels(body.channels);
  }
  if (body.target_type !== undefined) {
    const targetType = String(body.target_type) as BroadcastTargetType;
    if (!BROADCAST_TARGET_TYPES.includes(targetType)) {
      throw httpError(400, `target_type must be one of ${BROADCAST_TARGET_TYPES.join(', ')}`);
    }
    patch.target_type = targetType;
    if (targetType === 'manual') {
      const userIds = (body.target_filter as { user_ids?: unknown })?.user_ids;
      if (!Array.isArray(userIds) || userIds.length === 0 || !userIds.every(isUuid)) {
        throw httpError(400, 'target_filter.user_ids must be a non-empty uuid array for manual targeting');
      }
      if (userIds.length > getMaxRecipientsPerBroadcast()) {
        throw httpError(
          400,
          `Manual audience exceeds recipient cap (${getMaxRecipientsPerBroadcast()})`,
        );
      }
    }
    patch.target_filter = validateTargetFilter(targetType, body.target_filter);
  } else if (body.target_filter !== undefined) {
    patch.target_filter = body.target_filter as Record<string, unknown>;
  }

  const requestedStatus =
    typeof body.status === 'string' ? body.status.toLowerCase() : undefined;
  if (requestedStatus !== undefined) {
    if (requestedStatus !== 'draft' && requestedStatus !== 'scheduled' && requestedStatus !== 'cancelled') {
      throw httpError(400, "status must be 'draft', 'scheduled', or 'cancelled'");
    }
    patch.status = requestedStatus as BroadcastPatch['status'];
    if (requestedStatus === 'scheduled') {
      if (body.scheduled_at === undefined) {
        // keep existing scheduled_at (validated against NOW() in updateBroadcast)
      } else {
        const parsed = new Date(String(body.scheduled_at));
        if (Number.isNaN(parsed.getTime())) {
          throw httpError(400, 'scheduled_at must be a valid ISO timestamp');
        }
        patch.scheduled_at = parsed;
      }
    } else if (requestedStatus !== 'cancelled' && body.scheduled_at !== undefined) {
      const parsed = new Date(String(body.scheduled_at));
      if (Number.isNaN(parsed.getTime())) {
        throw httpError(400, 'scheduled_at must be a valid ISO timestamp');
      }
      patch.scheduled_at = parsed;
    }
  }

  if (Object.keys(patch).length === 0) {
    throw httpError(400, 'No updatable fields provided');
  }
  return patch;
};

export const updateBroadcast = async (
  broadcastId: string,
  patch: BroadcastPatch,
): Promise<Record<string, unknown>> => {
  const current = await db.query<{ id: string; status: BroadcastStatus; scheduled_at: Date | null }>(
    'SELECT id, status, scheduled_at FROM broadcasts WHERE id = $1 FOR UPDATE',
    [broadcastId],
  );
  if (current.rows.length === 0) {
    throw httpError(404, 'Broadcast not found');
  }
  if (!SENDABLE_FOR_UPDATE_STATUSES.includes(current.rows[0].status)) {
    throw httpError(
      409,
      `Broadcast with status '${current.rows[0].status}' cannot be edited or cancelled`,
    );
  }

  const assignments: string[] = [];
  const params: unknown[] = [];
  const setField = (column: string, value: unknown, cast = '') => {
    params.push(value);
    assignments.push(`${column} = $${params.length}${cast}`);
  };

  if (patch.title !== undefined) setField('title', patch.title);
  if (patch.body !== undefined) setField('body', patch.body);
  if (patch.image_url !== undefined) setField('image_url', patch.image_url);
  if (patch.deep_link !== undefined) setField('deep_link', patch.deep_link);
  if (patch.category !== undefined) setField('category', patch.category);
  if (patch.priority !== undefined) setField('priority', patch.priority);
  if (patch.channels !== undefined) {
    params.push(JSON.stringify(patch.channels));
    assignments.push(`channels = $${params.length}::jsonb`);
  }
  if (patch.target_type !== undefined) setField('target_type', patch.target_type);
  if (patch.target_filter !== undefined) {
    params.push(patch.target_filter ? JSON.stringify(patch.target_filter) : null);
    assignments.push(`target_filter = $${params.length}::jsonb`);
  }

  if (patch.status === 'scheduled') {
    const candidate =
      patch.scheduled_at !== undefined ? patch.scheduled_at : current.rows[0].scheduled_at;
    const scheduledAt = candidate ? new Date(candidate) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw httpError(400, 'A future scheduled_at is required to schedule this broadcast');
    }
    setField('status', 'scheduled');
    setField('scheduled_at', scheduledAt.toISOString());
  } else if (patch.status === 'draft') {
    setField('status', 'draft');
    setField('scheduled_at', null);
  } else if (patch.status === 'cancelled') {
    setField('status', 'cancelled');
    setField('scheduled_at', null);
  }

  const result = await db.query(
    `UPDATE broadcasts SET ${assignments.join(', ')} WHERE id = $${params.length + 1} RETURNING *`,
    [...params, broadcastId],
  );
  return result.rows[0];
};

export interface DeliveryReport {
  totals: {
    total_targets: number;
    sent_count: number;
    failed_count: number;
    opened_count: number;
  };
  per_channel: Array<{
    channel: string;
    pending: number;
    sent: number;
    failed: number;
    opened: number;
  }>;
}

export const getDeliveryReport = async (broadcastId: string): Promise<DeliveryReport> => {
  const [totalsRes, perChannelRes] = await Promise.all([
    readDb.query<{
      total_targets: number;
      sent_count: number;
      failed_count: number;
      opened_count: number;
    }>(
      `SELECT total_targets, sent_count, failed_count, opened_count
       FROM broadcasts WHERE id = $1`,
      [broadcastId],
    ),
    readDb.query(
      `SELECT channel,
              COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending,
              COUNT(*) FILTER (WHERE status IN ('sent','opened'))::INT AS sent,
              COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed,
              COUNT(*) FILTER (WHERE status = 'opened')::INT AS opened
       FROM broadcast_recipients
       WHERE broadcast_id = $1
       GROUP BY channel
       ORDER BY channel ASC`,
      [broadcastId],
    ),
  ]);

  const totalsRow = totalsRes.rows[0];
  return {
    totals: {
      total_targets: Number(totalsRow?.total_targets || 0),
      sent_count: Number(totalsRow?.sent_count || 0),
      failed_count: Number(totalsRow?.failed_count || 0),
      opened_count: Number(totalsRow?.opened_count || 0),
    },
    per_channel: perChannelRes.rows.map((row) => ({
      channel: row.channel,
      pending: Number(row.pending),
      sent: Number(row.sent),
      failed: Number(row.failed),
      opened: Number(row.opened),
    })),
  };
};

/** BC-6 audit trail on create/send/cancel (explicit writes; HTTP mutations are also audited globally). */
export const writeBroadcastAudit = async (
  actorId: string | undefined,
  action: string,
  targetId: string | null,
  payload: Record<string, unknown>,
): Promise<void> => {
  if (!actorId) return;
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_id, payload)
     VALUES ($1, $2, $3, $4)`,
    [actorId, action, targetId, JSON.stringify(payload)],
  ).catch((error) => {
    securityLog.error('[Broadcast] Audit log write failed', { action, error });
  });
};
