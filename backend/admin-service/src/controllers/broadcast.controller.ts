import { Request, Response } from 'express';
import { db } from '../db';
import { securityLog } from '../security/logRedaction';
import {
  consumeAdminBroadcastSendAllowance,
  getBroadcastById,
  getDeliveryReport,
  isUuid,
  listBroadcasts,
  updateBroadcast,
  validateBroadcastInput,
  validateBroadcastPatch,
  writeBroadcastAudit,
} from '../services/broadcast.service';
import { estimateCount, BroadcastTargetType } from '../services/broadcastTarget.service';
import { dispatchBroadcastAsync } from '../services/broadcastDelivery.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sendError = (res: Response, error: unknown) => {
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (statusCode) {
    res.status(statusCode).json({
      success: false,
      data: null,
      message: error instanceof Error ? error.message : 'Request failed',
    });
    return;
  }
  securityLog.error('[Broadcast] Controller error', { error });
  res.status(500).json({ success: false, data: null, message: 'Internal server error' });
};

// GET /admin/broadcasts
export const listAdminBroadcasts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(Number.parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(String(req.query.limit || '20'), 10) || 20, 1),
      100,
    );
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;

    const { rows, total } = await listBroadcasts({ status, category, page, limit });
    res.json({ success: true, data: rows, total, page, limit });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /admin/broadcasts/:id
export const getAdminBroadcastDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, data: null, message: 'Invalid broadcast id' });
      return;
    }
    const broadcast = await getBroadcastById(id);
    if (!broadcast) {
      res.status(404).json({ success: false, data: null, message: 'Broadcast not found' });
      return;
    }
    const report = await getDeliveryReport(id);
    res.json({ success: true, data: { ...broadcast, delivery_report: report } });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /admin/broadcasts — create draft/scheduled; optional send_now for immediate dispatch
export const createAdminBroadcast = async (req: Request, res: Response): Promise<void> => {
  try {
    const actorId = (req as any).user?.id as string | undefined;
    const input = validateBroadcastInput(req.body || {});

    const inserted = await db.query(
      `INSERT INTO broadcasts (
         title, body, image_url, deep_link, category, priority, channels,
         target_type, target_filter, status, scheduled_at, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11, $12)
       RETURNING *`,
      [
        input.title,
        input.body,
        input.image_url,
        input.deep_link,
        input.category,
        input.priority,
        JSON.stringify(input.channels),
        input.target_type,
        input.target_filter ? JSON.stringify(input.target_filter) : null,
        input.status,
        input.scheduled_at ? input.scheduled_at.toISOString() : null,
        actorId || null,
      ],
    );
    const broadcast = inserted.rows[0];

    await writeBroadcastAudit(actorId, 'broadcast.create', broadcast.id, {
      title_length: input.title.length,
      category: input.category,
      priority: input.priority,
      channels: input.channels,
      target_type: input.target_type,
      status: input.status,
    });

    if (req.body?.send_now === true && input.status === 'draft') {
      const allowed = await consumeAdminBroadcastSendAllowance(String(actorId));
      if (!allowed) {
        res.status(429).json({
          success: false,
          data: null,
          message: `Send rate limit exceeded: max sends per hour reached`,
          code: 'ERR_BROADCAST_RATE_LIMITED',
        });
        return;
      }
      const dispatched = await dispatchBroadcastAsync(broadcast.id);
      if (!dispatched.ok) {
        res.status(409).json({
          success: false,
          data: broadcast,
          message: dispatched.reason || 'broadcast_not_sendable',
          code: 'ERR_BROADCAST_NOT_SENDABLE',
        });
        return;
      }
      await writeBroadcastAudit(actorId, 'broadcast.send', broadcast.id, {
        trigger: 'create_send_now',
      });
      res.status(202).json({ success: true, data: { ...broadcast, status: 'sending' } });
      return;
    }

    res.status(201).json({ success: true, data: broadcast });
  } catch (error) {
    sendError(res, error);
  }
};

// PATCH /admin/broadcasts/:id — edit draft / schedule / cancel scheduled
export const updateAdminBroadcast = async (req: Request, res: Response): Promise<void> => {
  try {
    const actorId = (req as any).user?.id as string | undefined;
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, data: null, message: 'Invalid broadcast id' });
      return;
    }

    const patch = validateBroadcastPatch(req.body || {});
    const updated = await updateBroadcast(id, patch);

    await writeBroadcastAudit(
      actorId,
      patch.status === 'cancelled' ? 'broadcast.cancel' : 'broadcast.update',
      id,
      {
        fields: Object.keys(patch),
        new_status: patch.status || null,
      },
    );

    res.json({ success: true, data: updated });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /admin/broadcasts/:id/send — force-send a draft/scheduled broadcast now
export const sendAdminBroadcast = async (req: Request, res: Response): Promise<void> => {
  try {
    const actorId = (req as any).user?.id as string | undefined;
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, data: null, message: 'Invalid broadcast id' });
      return;
    }

    const existing = await getBroadcastById(id);
    if (!existing) {
      res.status(404).json({ success: false, data: null, message: 'Broadcast not found' });
      return;
    }
    if (!['draft', 'scheduled'].includes(String(existing.status))) {
      res.status(409).json({
        success: false,
        data: null,
        message: `Broadcast with status '${existing.status}' cannot be sent`,
        code: 'ERR_BROADCAST_NOT_SENDABLE',
      });
      return;
    }

    // BC-6 server-side throttle: max N sends/hour/admin.
    const allowed = await consumeAdminBroadcastSendAllowance(String(actorId));
    if (!allowed) {
      res.status(429).json({
        success: false,
        data: null,
        message: 'Send rate limit exceeded: max sends per hour reached',
        code: 'ERR_BROADCAST_RATE_LIMITED',
      });
      return;
    }

    // Claims synchronously (CAS) so concurrent/double requests lose cleanly.
    const dispatched = await dispatchBroadcastAsync(id);
    if (!dispatched.ok) {
      res.status(409).json({
        success: false,
        data: null,
        message: dispatched.reason || 'broadcast_not_sendable',
        code: 'ERR_BROADCAST_NOT_SENDABLE',
      });
      return;
    }

    await writeBroadcastAudit(actorId, 'broadcast.send', id, {
      trigger: 'manual_endpoint',
    });

    res.status(202).json({ success: true, data: { id, status: 'sending' } });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /admin/broadcasts/:id/report
export const getAdminBroadcastReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, data: null, message: 'Invalid broadcast id' });
      return;
    }
    const broadcast = await getBroadcastById(id);
    if (!broadcast) {
      res.status(404).json({ success: false, data: null, message: 'Broadcast not found' });
      return;
    }
    const report = await getDeliveryReport(id);
    res.json({
      success: true,
      data: {
        broadcast_id: id,
        status: broadcast.status,
        scheduled_at: broadcast.scheduled_at,
        sent_at: broadcast.sent_at,
        ...report,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /admin/broadcasts/targets/estimate?target_type=filter&target_filter={"roles":["courier"]}
export const estimateAdminTargets = async (req: Request, res: Response): Promise<void> => {
  try {
    const targetType = String(req.query.target_type || 'all') as BroadcastTargetType;
    if (!['all', 'online', 'filter', 'manual'].includes(targetType)) {
      res
        .status(400)
        .json({ success: false, data: null, message: 'target_type must be all|online|filter|manual' });
      return;
    }

    let filter: unknown = null;
    const rawFilter = req.query.target_filter;
    if (typeof rawFilter === 'string' && rawFilter.trim()) {
      try {
        filter = JSON.parse(rawFilter);
      } catch {
        res.status(400).json({ success: false, data: null, message: 'target_filter must be valid JSON' });
        return;
      }
    } else if (rawFilter && typeof rawFilter === 'object') {
      filter = rawFilter;
    }

    const count = await estimateCount(targetType, filter);
    res.json({ success: true, data: { target_type: targetType, estimated_targets: count } });
  } catch (error) {
    sendError(res, error);
  }
};

// PATCH /api/v1/mobile/notifications/:id/opened
// Thin opened-tracking hook: marks the notification read AND flips the linked
// broadcast_recipients row to 'opened' when metadata.broadcast_id exists.
export const markMobileNotificationOpened = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }
    if (!UUID_PATTERN.test(String(id))) {
      res.status(400).json({ success: false, data: null, message: 'Notification id is invalid', code: 'ERR_INVALID_NOTIFICATION_ID' });
      return;
    }

    const claimed = await db.query<{ broadcast_id: string | null }>(
      `WITH owned AS (
         UPDATE notifications
         SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
         WHERE id = $1 AND user_id = $2
         RETURNING metadata->>'broadcast_id' AS broadcast_id
       )
       SELECT broadcast_id FROM owned`,
      [id, userId],
    );

    if (claimed.rowCount === 0) {
      res.status(404).json({ success: false, data: null, message: 'Notification not found', code: 'ERR_NOTIFICATION_NOT_FOUND' });
      return;
    }

    const broadcastId = claimed.rows[0]?.broadcast_id;
    let recipientOpened = false;
    if (broadcastId && UUID_PATTERN.test(broadcastId)) {
      const opened = await db.query(
        `UPDATE broadcast_recipients
         SET status = 'opened', opened_at = COALESCE(opened_at, NOW())
         WHERE broadcast_id = $1
           AND user_id = $2
           AND status <> 'opened'
         RETURNING id`,
        [broadcastId, userId],
      );

      if ((opened.rowCount || 0) > 0) {
        await db.query(
          `UPDATE broadcasts
           SET opened_count = LEAST(opened_count + 1, total_targets)
           WHERE id = $1`,
          [broadcastId],
        );
        recipientOpened = true;
      }
    }

    res.json({ success: true, data: { notification_id: id, broadcast_opened: recipientOpened } });
  } catch (error) {
    securityLog.error('[Broadcast] Failed to track notification open', { error });
    res.status(500).json({ success: false, data: null, message: 'Failed to update notification', code: 'ERR_NOTIFICATION_UPDATE_FAILED' });
  }
};
