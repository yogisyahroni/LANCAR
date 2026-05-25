import { Request, Response } from 'express';
import { db, readDb } from '../db';

const LOOKUP_CACHE_TTL_SECONDS = 300;

const requireActorId = (req: Request, res: Response): string | null => {
  const actorId = req.user?.id;
  if (!actorId) {
    res.status(401).json({ success: false, error: 'Authenticated admin actor is required' });
    return null;
  }
  return actorId;
};

const normalizeBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  if (typeof value === 'number') return value === 1;
  return fallback;
};

const normalizeInteger = (value: unknown, fallback = 100): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const auditLookupChange = async (
  client: any,
  actorId: string,
  action: string,
  payload: Record<string, unknown>,
  targetId?: string | null
) => {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, target_id, payload)
     VALUES ($1, $2, $3, $4)`,
    [actorId, action, targetId || null, JSON.stringify(payload)]
  );
};

export const listAdminPickupCancellationReasons = async (req: Request, res: Response): Promise<void> => {
  try {
    const includeInactive = normalizeBoolean(req.query.include_inactive, false);
    const { rows } = await readDb.query(
      `SELECT code, title, description, is_active, display_order, created_at, updated_at
         FROM courier_pickup_cancellation_reasons
        WHERE ($1::boolean = TRUE OR is_active = TRUE)
        ORDER BY display_order ASC, title ASC`,
      [includeInactive]
    );

    const version = rows.reduce((latest, row) => {
      const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      return Math.max(latest, updatedAt);
    }, 0);

    res.json({
      success: true,
      data: rows,
      cache_ttl_seconds: LOOKUP_CACHE_TTL_SECONDS,
      version: version > 0 ? new Date(version).toISOString() : null,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createAdminPickupCancellationReason = async (req: Request, res: Response): Promise<void> => {
  const actorId = requireActorId(req, res);
  if (!actorId) return;

  const code = String(req.body?.code || '').trim().toLowerCase();
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const displayOrder = normalizeInteger(req.body?.display_order ?? req.body?.displayOrder, 100);
  const isActive = normalizeBoolean(req.body?.is_active ?? req.body?.isActive, true);

  if (!/^[a-z0-9_:-]{3,80}$/.test(code) || title.length < 3 || description.length < 8) {
    res.status(400).json({ success: false, error: 'code, title, and description are required and must be valid' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO courier_pickup_cancellation_reasons (code, title, description, is_active, display_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING code, title, description, is_active, display_order, created_at, updated_at`,
      [code, title, description, isActive, displayOrder]
    );

    await auditLookupChange(client, actorId, 'lookup.pickup_cancel_reason.created', { after: rows[0] });
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(error.code === '23505' ? 409 : 500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const updateAdminPickupCancellationReason = async (req: Request, res: Response): Promise<void> => {
  const actorId = requireActorId(req, res);
  if (!actorId) return;

  const code = String(req.params.code || '').trim().toLowerCase();
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const displayOrder = normalizeInteger(req.body?.display_order ?? req.body?.displayOrder, 100);
  const isActive = normalizeBoolean(req.body?.is_active ?? req.body?.isActive, true);

  if (!code || title.length < 3 || description.length < 8) {
    res.status(400).json({ success: false, error: 'title and description are required and must be valid' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      `SELECT code, title, description, is_active, display_order, created_at, updated_at
         FROM courier_pickup_cancellation_reasons
        WHERE code = $1
        FOR UPDATE`,
      [code]
    );
    if (!before.rows.length) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Pickup cancellation reason not found' });
      return;
    }

    const { rows } = await client.query(
      `UPDATE courier_pickup_cancellation_reasons
          SET title = $2,
              description = $3,
              is_active = $4,
              display_order = $5,
              updated_at = NOW()
        WHERE code = $1
        RETURNING code, title, description, is_active, display_order, created_at, updated_at`,
      [code, title, description, isActive, displayOrder]
    );

    await auditLookupChange(client, actorId, 'lookup.pickup_cancel_reason.updated', {
      code,
      before: before.rows[0],
      after: rows[0],
    });
    await client.query('COMMIT');
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const deactivateAdminPickupCancellationReason = async (req: Request, res: Response): Promise<void> => {
  const actorId = requireActorId(req, res);
  if (!actorId) return;

  const code = String(req.params.code || '').trim().toLowerCase();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE courier_pickup_cancellation_reasons
          SET is_active = FALSE,
              updated_at = NOW()
        WHERE code = $1
        RETURNING code, title, description, is_active, display_order, created_at, updated_at`,
      [code]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Pickup cancellation reason not found' });
      return;
    }
    await auditLookupChange(client, actorId, 'lookup.pickup_cancel_reason.deactivated', { after: rows[0] });
    await client.query('COMMIT');
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const listAdminStatusTransitionPolicies = async (req: Request, res: Response): Promise<void> => {
  try {
    const includeInactive = normalizeBoolean(req.query.include_inactive, false);
    const workflowRole = String(req.query.workflow_role || req.query.workflowRole || '').trim().toLowerCase();
    const { rows } = await readDb.query(
      `SELECT id, workflow_role, from_status, to_status, label, description, requires_proof,
              requires_admin, is_active, display_order, version, created_at, updated_at
         FROM status_transition_policies
        WHERE ($1::boolean = TRUE OR is_active = TRUE)
          AND ($2::text = '' OR workflow_role = $2)
        ORDER BY workflow_role ASC, from_status ASC, display_order ASC, label ASC`,
      [includeInactive, workflowRole]
    );

    const version = rows.reduce((latest, row) => {
      const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      return Math.max(latest, updatedAt);
    }, 0);

    res.json({
      success: true,
      data: rows,
      cache_ttl_seconds: LOOKUP_CACHE_TTL_SECONDS,
      version: version > 0 ? new Date(version).toISOString() : null,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const statusTransitionPayload = (body: any) => ({
  workflowRole: String(body?.workflow_role || body?.workflowRole || '').trim().toLowerCase(),
  fromStatus: String(body?.from_status || body?.fromStatus || '').trim().toLowerCase(),
  toStatus: String(body?.to_status || body?.toStatus || '').trim().toLowerCase(),
  label: String(body?.label || '').trim(),
  description: body?.description === undefined || body?.description === null ? null : String(body.description).trim(),
  requiresProof: normalizeBoolean(body?.requires_proof ?? body?.requiresProof, false),
  requiresAdmin: normalizeBoolean(body?.requires_admin ?? body?.requiresAdmin, false),
  isActive: normalizeBoolean(body?.is_active ?? body?.isActive, true),
  displayOrder: normalizeInteger(body?.display_order ?? body?.displayOrder, 100),
});

const isValidTransitionPayload = (payload: ReturnType<typeof statusTransitionPayload>) => {
  const statusPattern = /^[a-z0-9_:-]{2,60}$/;
  return statusPattern.test(payload.workflowRole) &&
    statusPattern.test(payload.fromStatus) &&
    statusPattern.test(payload.toStatus) &&
    payload.fromStatus !== payload.toStatus &&
    payload.label.length >= 3;
};

export const createAdminStatusTransitionPolicy = async (req: Request, res: Response): Promise<void> => {
  const actorId = requireActorId(req, res);
  if (!actorId) return;

  const payload = statusTransitionPayload(req.body);
  if (!isValidTransitionPayload(payload)) {
    res.status(400).json({ success: false, error: 'Invalid status transition policy payload' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO status_transition_policies (
          workflow_role, from_status, to_status, label, description,
          requires_proof, requires_admin, is_active, display_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, workflow_role, from_status, to_status, label, description, requires_proof,
                 requires_admin, is_active, display_order, version, created_at, updated_at`,
      [
        payload.workflowRole,
        payload.fromStatus,
        payload.toStatus,
        payload.label,
        payload.description,
        payload.requiresProof,
        payload.requiresAdmin,
        payload.isActive,
        payload.displayOrder,
      ]
    );
    await auditLookupChange(client, actorId, 'lookup.status_transition.created', { after: rows[0] }, rows[0].id);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(error.code === '23505' ? 409 : 500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const updateAdminStatusTransitionPolicy = async (req: Request, res: Response): Promise<void> => {
  const actorId = requireActorId(req, res);
  if (!actorId) return;

  const id = String(req.params.id || '').trim();
  const payload = statusTransitionPayload(req.body);
  if (!id || !isValidTransitionPayload(payload)) {
    res.status(400).json({ success: false, error: 'Invalid status transition policy payload' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      `SELECT id, workflow_role, from_status, to_status, label, description, requires_proof,
              requires_admin, is_active, display_order, version, created_at, updated_at
         FROM status_transition_policies
        WHERE id = $1
        FOR UPDATE`,
      [id]
    );
    if (!before.rows.length) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Status transition policy not found' });
      return;
    }

    const { rows } = await client.query(
      `UPDATE status_transition_policies
          SET workflow_role = $2,
              from_status = $3,
              to_status = $4,
              label = $5,
              description = $6,
              requires_proof = $7,
              requires_admin = $8,
              is_active = $9,
              display_order = $10,
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, workflow_role, from_status, to_status, label, description, requires_proof,
                  requires_admin, is_active, display_order, version, created_at, updated_at`,
      [
        id,
        payload.workflowRole,
        payload.fromStatus,
        payload.toStatus,
        payload.label,
        payload.description,
        payload.requiresProof,
        payload.requiresAdmin,
        payload.isActive,
        payload.displayOrder,
      ]
    );

    await auditLookupChange(client, actorId, 'lookup.status_transition.updated', {
      before: before.rows[0],
      after: rows[0],
    }, id);
    await client.query('COMMIT');
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(error.code === '23505' ? 409 : 500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

export const deactivateAdminStatusTransitionPolicy = async (req: Request, res: Response): Promise<void> => {
  const actorId = requireActorId(req, res);
  if (!actorId) return;

  const id = String(req.params.id || '').trim();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE status_transition_policies
          SET is_active = FALSE,
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, workflow_role, from_status, to_status, label, description, requires_proof,
                  requires_admin, is_active, display_order, version, created_at, updated_at`,
      [id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Status transition policy not found' });
      return;
    }
    await auditLookupChange(client, actorId, 'lookup.status_transition.deactivated', { after: rows[0] }, id);
    await client.query('COMMIT');
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};
