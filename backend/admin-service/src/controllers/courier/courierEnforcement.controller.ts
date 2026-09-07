import { Request, Response } from 'express';
import { db, readDb } from '../../db';
import { securityLog } from '../../security/logRedaction';
import { getActorId } from '../../utils/authUtils';
import {
  CourierEnforcementPolicyError,
  courierEnforcementDisplayReason,
  normalizeCourierEnforcementInput,
} from '../../services/courierEnforcementPolicy';

const ACTIVE_JOB_STATUSES = [
  'delivered',
  'completed',
  'failed',
  'cancelled',
  'rejected',
  'return_required',
];

const UNPICKED_JOB_STATUSES = ['accepted', 'assigned', 'going_to_pickup', 'pickup_pending'];

const enforcementActionSelect = `
  cea.id,
  cea.courier_profile_id,
  cea.enforcement_type,
  cea.scope,
  cea.market_code,
  cea.service_code,
  cea.reason_category,
  cea.reason_detail,
  cea.courier_message,
  cea.disclosure_level,
  cea.effective_from,
  cea.effective_until,
  cea.safe_job_policy,
  cea.status,
  cea.restoration_snapshot,
  cea.created_by,
  cea.revoked_by,
  cea.revoked_at,
  cea.created_at,
  cea.updated_at`;

const enforcementActionReturning = `
  id,
  courier_profile_id,
  enforcement_type,
  scope,
  market_code,
  service_code,
  reason_category,
  reason_detail,
  courier_message,
  disclosure_level,
  effective_from,
  effective_until,
  safe_job_policy,
  status,
  restoration_snapshot,
  created_by,
  revoked_by,
  revoked_at,
  created_at,
  updated_at`;

const visibleAction = (row: Record<string, any>) => ({
  id: row.id,
  courier_profile_id: row.courier_profile_id,
  enforcement_type: row.enforcement_type,
  scope: row.scope,
  market_code: row.market_code || null,
  service_code: row.service_code || null,
  ...courierEnforcementDisplayReason(row),
  effective_from: row.effective_from,
  effective_until: row.effective_until,
  safe_job_policy: row.safe_job_policy,
  status: row.status,
  active_job_count: Number(row.active_job_count || 0),
  created_at: row.created_at,
  updated_at: row.updated_at,
  appeal_eligible: !['revoked', 'expired'].includes(String(row.status || '').toLowerCase()),
});

const accountSuspensionUpdate = async (client: any, profileId: string, actorId: string, reason: string) => {
  await client.query(`SELECT set_config('app.actor_id', $1, TRUE), set_config('app.actor_reason', $2, TRUE)`, [
    actorId,
    reason,
  ]);
  await client.query(
    `UPDATE users
     SET status = 'suspended', updated_at = NOW()
     WHERE id = (SELECT user_id FROM courier_profiles WHERE id = $1)
       AND status = 'active'`,
    [profileId],
  );
  await client.query(
    `UPDATE courier_profiles
     SET onboarding_status = CASE WHEN onboarding_status = 'ACTIVE' THEN 'SUSPENDED' ELSE onboarding_status END,
         verification_status = CASE WHEN verification_status = 'approved' THEN 'suspended' ELSE verification_status END,
         is_verified = CASE WHEN onboarding_status = 'ACTIVE' THEN FALSE ELSE is_verified END,
         status = 'suspended',
         is_online = FALSE,
         reviewed_at = NOW(),
         reviewed_by = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [profileId, actorId],
  );
};

const auditEnforcement = async (
  client: any,
  actorId: string,
  action: string,
  targetId: string,
  payload: Record<string, unknown>,
) => {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, target_id, payload)
     VALUES ($1, $2, $3, $4)`,
    [actorId, action, targetId, JSON.stringify(payload)],
  );
};

export const getMobileCourierEnforcement = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    await db.query('SELECT refresh_courier_enforcement_actions()');
    const profileRes = await readDb.query(
      `SELECT id, market_code
       FROM courier_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [req.user.id],
    );
    const profile = profileRes.rows[0];
    if (!profile) {
      res.status(404).json({ success: false, data: null, message: 'Courier profile not found', code: 'ERR_NOT_FOUND' });
      return;
    }

    const actionsRes = await readDb.query(
      `SELECT ${enforcementActionSelect},
              COALESCE((
                SELECT COUNT(*)::int
                FROM order_legs active_ol
                WHERE active_ol.courier_id = cp.user_id
                  AND COALESCE(active_ol.status, '') <> ALL($2::text[])
              ), 0)::int AS active_job_count
       FROM courier_enforcement_actions cea
       JOIN courier_profiles cp ON cp.id = cea.courier_profile_id
       WHERE cea.courier_profile_id = $1
         AND (
           (cea.status IN ('active', 'pending_safe_completion')
            AND cea.effective_from <= NOW()
            AND (cea.effective_until IS NULL OR cea.effective_until > NOW()))
           OR cea.status = 'scheduled'
         )
         AND (cea.scope = 'account'
              OR (cea.scope = 'market' AND LOWER(cea.market_code) = LOWER(cp.market_code))
              OR cea.scope = 'capability')
       ORDER BY cea.effective_from DESC, cea.created_at DESC`,
      [profile.id, ACTIVE_JOB_STATUSES],
    );

    const appealsRes = await readDb.query(
      `SELECT cea.id AS action_id, cea.scope, cea.service_code, cea.market_code,
              cea.reason_category, cea.disclosure_level,
              cea.courier_message, cea.effective_from, cea.effective_until,
              cea.status AS action_status,
              cea2.id, cea2.reason, cea2.status, cea2.review_note,
              cea2.submitted_at, cea2.reviewed_at
       FROM courier_enforcement_appeals cea2
       JOIN courier_enforcement_actions cea ON cea.id = cea2.enforcement_action_id
       WHERE cea2.courier_profile_id = $1
       ORDER BY cea2.submitted_at DESC
       LIMIT 50`,
      [profile.id],
    );

    res.json({
      success: true,
      data: {
        courier_profile_id: profile.id,
        current_market_code: profile.market_code,
        active_actions: actionsRes.rows.map(visibleAction),
        appeals: appealsRes.rows,
        policy: {
          account_or_market_actions_stop_new_matching: true,
          active_jobs: 'complete_safely_or_reassign_unpicked_jobs_before_account_suspension_when_possible',
          security_restricted_reason: 'Only the actionable security category is disclosed while investigation details remain protected.',
          reinstatement: 'Only the capability state captured as approved before enforcement may be restored.',
        },
      },
      message: 'Courier enforcement status loaded',
    });
  } catch (error: any) {
    securityLog.error('Get mobile courier enforcement error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const submitMobileCourierEnforcementAppeal = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const actionId = String(req.body?.enforcement_action_id || req.body?.action_id || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (!actionId || reason.length < 10 || reason.length > 2000) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'enforcement_action_id dan alasan 10-2000 karakter wajib diisi.',
      code: 'ERR_INVALID_APPEAL',
    });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const actionRes = await client.query(
      `SELECT cea.id, cea.courier_profile_id, cea.status
       FROM courier_enforcement_actions cea
       JOIN courier_profiles cp ON cp.id = cea.courier_profile_id
       WHERE cea.id = $1 AND cp.user_id = $2
       FOR SHARE`,
      [actionId, req.user.id],
    );
    const action = actionRes.rows[0];
    if (!action) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Enforcement action not found', code: 'ERR_NOT_FOUND' });
      return;
    }
    if (['revoked', 'expired'].includes(action.status)) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, data: null, message: 'Enforcement action sudah selesai dan tidak dapat diajukan banding.', code: 'ERR_ACTION_CLOSED' });
      return;
    }

    const appealRes = await client.query(
      `INSERT INTO courier_enforcement_appeals (enforcement_action_id, courier_profile_id, reason)
       VALUES ($1, $2, $3)
       RETURNING id, enforcement_action_id, courier_profile_id, reason, status, submitted_at, reviewed_at`,
      [action.id, action.courier_profile_id, reason],
    );
    await client.query(
      `INSERT INTO courier_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
       VALUES ($1, 'appeal_submitted', $2, $3)`,
      [action.id, req.user.id, JSON.stringify({ appeal_id: appealRes.rows[0].id, source: 'courier_app' })],
    );
    await auditEnforcement(client, req.user.id, 'courier.enforcement.appeal.submitted', action.id, {
      appeal_id: appealRes.rows[0].id,
      source: 'courier_app',
    });
    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: { appeal: appealRes.rows[0], server_authoritative: true },
      message: 'Banding enforcement berhasil dikirim untuk ditinjau.',
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') {
      res.status(409).json({ success: false, data: null, message: 'Masih ada banding aktif untuk enforcement ini.', code: 'ERR_APPEAL_ALREADY_OPEN' });
      return;
    }
    securityLog.error('Submit mobile courier enforcement appeal error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};

export const createAdminCourierEnforcementAction = async (req: Request, res: Response): Promise<void> => {
  let normalized;
  try {
    normalized = normalizeCourierEnforcementInput({
      type: req.body?.type || req.body?.enforcement_type,
      scope: req.body?.scope,
      reasonCategory: req.body?.reason_category || req.body?.reasonCategory,
      reasonDetail: req.body?.reason_detail || req.body?.reason,
      courierMessage: req.body?.courier_message || req.body?.courierMessage,
      marketCode: req.body?.market_code || req.body?.marketCode,
      serviceCode: req.body?.service_code || req.body?.serviceCode,
      effectiveFrom: req.body?.effective_from || req.body?.effectiveFrom,
      effectiveUntil: req.body?.effective_until || req.body?.effectiveUntil,
      safeJobPolicy: req.body?.safe_job_policy || req.body?.safeJobPolicy,
      disclosureLevel: req.body?.disclosure_level || req.body?.disclosureLevel,
    });
  } catch (error: any) {
    const policyError = error instanceof CourierEnforcementPolicyError;
    res.status(400).json({
      success: false,
      data: null,
      message: error.message,
      code: policyError ? error.code : 'ERR_INVALID_ENFORCEMENT',
    });
    return;
  }

  const profileId = String(req.params.id || '').trim();
  const actorId = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const profileRes = await client.query(
      `SELECT cp.id, cp.user_id, cp.market_code, cp.status AS profile_status,
              cp.onboarding_status, cp.verification_status, cp.is_verified,
              u.status AS user_status
       FROM courier_profiles cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.id = $1
       FOR UPDATE OF cp, u`,
      [profileId],
    );
    const profile = profileRes.rows[0];
    if (!profile) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Courier profile not found', code: 'ERR_NOT_FOUND' });
      return;
    }

    const duplicateRes = await client.query(
      `SELECT id
       FROM courier_enforcement_actions
       WHERE courier_profile_id = $1
         AND status IN ('scheduled', 'pending_safe_completion', 'active')
         AND scope = $2
         AND (scope <> 'market' OR LOWER(market_code) = LOWER($3))
         AND (scope <> 'capability' OR LOWER(service_code) = LOWER($4))
       LIMIT 1`,
      [profileId, normalized.scope, normalized.marketCode, normalized.serviceCode],
    );
    if (duplicateRes.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, data: null, message: 'Target sudah memiliki enforcement aktif.', code: 'ERR_ENFORCEMENT_ALREADY_ACTIVE' });
      return;
    }

    let capabilitySnapshot: Record<string, unknown> | null = null;
    if (normalized.scope === 'capability') {
      const capabilityRes = await client.query(
        `SELECT status, eligibility_reason, suspension_reason, approved_by, approved_at,
                certified_at, effective_from, expires_at, market_scope
         FROM courier_service_capabilities
         WHERE courier_profile_id = $1 AND LOWER(service_code) = LOWER($2)
         FOR UPDATE`,
        [profileId, normalized.serviceCode],
      );
      const capability = capabilityRes.rows[0];
      if (!capability) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, data: null, message: 'Courier capability not found', code: 'ERR_CAPABILITY_NOT_FOUND' });
        return;
      }
      capabilitySnapshot = {
        status: capability.status,
        eligibility_reason: capability.eligibility_reason,
        suspension_reason: capability.suspension_reason,
        approved_by: capability.approved_by,
        approved_at: capability.approved_at,
        certified_at: capability.certified_at,
        effective_from: capability.effective_from,
        expires_at: capability.expires_at,
        market_scope: capability.market_scope,
      };
    }

    const jobsRes = await client.query(
      `SELECT
         COUNT(*)::int AS active_job_count,
         COUNT(*) FILTER (WHERE ol.status = ANY($2::text[]))::int AS unpicked_job_count
       FROM order_legs ol
       WHERE ol.courier_id = $1
         AND COALESCE(ol.status, '') <> ALL($3::text[])`,
      [profile.user_id, UNPICKED_JOB_STATUSES, ACTIVE_JOB_STATUSES],
    );
    let activeJobCount = Number(jobsRes.rows[0]?.active_job_count || 0);
    let unpickedJobCount = Number(jobsRes.rows[0]?.unpicked_job_count || 0);
    const startsInFuture = normalized.effectiveFrom.getTime() > Date.now();
    let initialStatus: 'scheduled' | 'pending_safe_completion' | 'active' = startsInFuture ? 'scheduled' : 'active';
    if (
      initialStatus === 'active'
      && normalized.scope === 'account'
      && normalized.type === 'suspension'
      && normalized.safeJobPolicy !== 'immediate_safety_stop'
      && activeJobCount > 0
    ) {
      initialStatus = 'pending_safe_completion';
    }

    const snapshot = {
      user_status: profile.user_status,
      profile_status: profile.profile_status,
      onboarding_status: profile.onboarding_status,
      verification_status: profile.verification_status,
      is_verified: profile.is_verified,
      ...(capabilitySnapshot ? { capability: capabilitySnapshot } : {}),
    };
    const actionRes = await client.query(
      `INSERT INTO courier_enforcement_actions (
         courier_profile_id, enforcement_type, scope, market_code, service_code,
         reason_category, reason_detail, courier_message, disclosure_level,
         effective_from, effective_until, safe_job_policy, status,
         restoration_snapshot, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING ${enforcementActionReturning}`,
      [
        profileId,
        normalized.type,
        normalized.scope,
        normalized.marketCode,
        normalized.serviceCode,
        normalized.reasonCategory,
        normalized.reasonDetail,
        normalized.courierMessage,
        normalized.disclosureLevel,
        normalized.effectiveFrom,
        normalized.effectiveUntil,
        normalized.safeJobPolicy,
        initialStatus,
        JSON.stringify(snapshot),
        actorId,
      ],
    );
    const action = actionRes.rows[0];

    if (initialStatus !== 'scheduled' && normalized.scope === 'capability' && capabilitySnapshot?.status === 'enabled') {
      const capabilityStatus = normalized.type === 'restriction' ? 'paused' : 'suspended';
      await client.query(
        `UPDATE courier_service_capabilities
         SET status = $1,
             eligibility_reason = $2,
             suspension_reason = $2,
             paused_at = NOW(),
             paused_by = $3,
             updated_at = NOW()
         WHERE courier_profile_id = $4 AND LOWER(service_code) = LOWER($5)`,
        [capabilityStatus, normalized.reasonDetail, actorId, profileId, normalized.serviceCode],
      );
    }

    if (initialStatus !== 'scheduled' && normalized.scope === 'account' && normalized.type === 'suspension') {
      if (normalized.safeJobPolicy === 'reassign_unpicked_jobs' && unpickedJobCount > 0) {
        const reassigned = await client.query(
          `UPDATE order_legs
           SET courier_id = NULL,
               status = 'pending',
               updated_at = NOW()
           WHERE courier_id = $1
             AND status = ANY($2::text[])
           RETURNING id, order_id`,
          [profile.user_id, UNPICKED_JOB_STATUSES],
        );
        unpickedJobCount = reassigned.rows.length;
        for (const row of reassigned.rows) {
          await client.query(
            `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
             VALUES ($1, $2, 'courier_enforcement_reassignment_requested', $3, $4)`,
            [
              row.order_id,
              actorId,
              'Active pickup work was returned to the dispatch queue before courier suspension.',
              JSON.stringify({ enforcement_action_id: action.id, policy: normalized.safeJobPolicy, order_leg_id: row.id }),
            ],
          );
        }
        await client.query(
          `INSERT INTO courier_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
           VALUES ($1, 'reassignment_requested', $2, $3)`,
          [action.id, actorId, JSON.stringify({ unpicked_job_count: unpickedJobCount })],
        );
        const remainingJobsRes = await client.query(
          `SELECT COUNT(*)::int AS active_job_count
           FROM order_legs
           WHERE courier_id = $1 AND COALESCE(status, '') <> ALL($2::text[])`,
          [profile.user_id, ACTIVE_JOB_STATUSES],
        );
        activeJobCount = Number(remainingJobsRes.rows[0]?.active_job_count || 0);
      }

      if (activeJobCount > 0 && initialStatus === 'pending_safe_completion') {
        await client.query(
          `INSERT INTO courier_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
           VALUES ($1, 'safe_completion_pending', $2, $3)`,
          [action.id, actorId, JSON.stringify({ active_job_count: activeJobCount, policy: normalized.safeJobPolicy })],
        );
      } else {
        await accountSuspensionUpdate(client, profileId, actorId, normalized.reasonDetail);
        if (initialStatus === 'pending_safe_completion') {
          await client.query(
            `UPDATE courier_enforcement_actions SET status = 'active', updated_at = NOW() WHERE id = $1`,
            [action.id],
          );
          initialStatus = 'active';
        }
      }
    }

    if (initialStatus === 'scheduled') {
      await client.query(
        `INSERT INTO courier_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
         VALUES ($1, 'created', $2, $3)`,
        [action.id, actorId, JSON.stringify({ effective_from: normalized.effectiveFrom.toISOString(), status: initialStatus })],
      );
    } else if (initialStatus === 'pending_safe_completion') {
      // The safe-completion event above is the creation audit for this state.
    } else {
      await client.query(
        `INSERT INTO courier_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
         VALUES ($1, 'created', $2, $3)`,
        [action.id, actorId, JSON.stringify({ status: initialStatus })],
      );
    }
    await auditEnforcement(client, actorId, 'courier.enforcement.created', action.id, {
      courier_profile_id: profileId,
      type: normalized.type,
      scope: normalized.scope,
      status: initialStatus,
      safe_job_policy: normalized.safeJobPolicy,
      active_job_count: activeJobCount,
    });

    await client.query('COMMIT');
    const refreshed = await readDb.query(
      `SELECT ${enforcementActionSelect}, 0::int AS active_job_count
       FROM courier_enforcement_actions cea
       WHERE cea.id = $1`,
      [action.id],
    );
    res.status(201).json({
      success: true,
      data: {
        action: visibleAction(refreshed.rows[0] || { ...action, status: initialStatus, active_job_count: activeJobCount }),
        active_job_count: activeJobCount,
        unpicked_job_count: unpickedJobCount,
        safe_completion: {
          policy: normalized.safeJobPolicy,
          pending: initialStatus === 'pending_safe_completion',
          active_jobs_preserved: normalized.safeJobPolicy === 'allow_active_job_completion',
          unpicked_jobs_reassigned: normalized.safeJobPolicy === 'reassign_unpicked_jobs',
        },
      },
      message: 'Courier enforcement action created',
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Create admin courier enforcement action error:', { error: error.message, actor: actorId });
    res.status(error?.code === '23514' ? 400 : 500).json({
      success: false,
      data: null,
      message: error?.code === '23514' ? 'Enforcement action rejected by database policy' : 'Internal Server Error',
      code: error?.code === '23514' ? 'ERR_ENFORCEMENT_POLICY' : 'ERR_INTERNAL_SERVER',
    });
  } finally {
    client.release();
  }
};

export const listAdminCourierEnforcementActions = async (req: Request, res: Response): Promise<void> => {
  try {
    await db.query('SELECT refresh_courier_enforcement_actions()');
    const profileId = req.params.id ? String(req.params.id) : null;
    const result = await readDb.query(
      `SELECT ${enforcementActionSelect},
              u.full_name AS courier_name,
              u.phone_number AS courier_phone,
              COALESCE((
                SELECT COUNT(*)::int
                FROM order_legs active_ol
                WHERE active_ol.courier_id = cp.user_id
                  AND COALESCE(active_ol.status, '') <> ALL($2::text[])
              ), 0)::int AS active_job_count,
              (SELECT COUNT(*)::int FROM courier_enforcement_appeals cea2 WHERE cea2.enforcement_action_id = cea.id) AS appeal_count
       FROM courier_enforcement_actions cea
       JOIN courier_profiles cp ON cp.id = cea.courier_profile_id
       JOIN users u ON u.id = cp.user_id
       WHERE ($1::uuid IS NULL OR cea.courier_profile_id = $1::uuid)
       ORDER BY cea.created_at DESC
       LIMIT 500`,
      [profileId || null, ACTIVE_JOB_STATUSES],
    );
    res.json({ success: true, data: result.rows.map(visibleAction), total: result.rows.length });
  } catch (error: any) {
    securityLog.error('List admin courier enforcement actions error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const listAdminCourierEnforcementAppeals = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
    const result = await readDb.query(
      `SELECT cea2.*, cea.enforcement_type, cea.scope, cea.market_code, cea.service_code,
              cea.reason_category, cea.courier_message, cea.disclosure_level,
              cea.effective_from, cea.effective_until, cea.safe_job_policy, cea.status AS action_status,
              u.full_name AS courier_name, u.phone_number AS courier_phone,
              ARRAY(
                SELECT jsonb_build_object('event_type', ce.event_type, 'actor_id', ce.actor_id, 'created_at', ce.created_at, 'metadata', ce.metadata)
                FROM courier_enforcement_action_events ce
                WHERE ce.enforcement_action_id = cea.id
                ORDER BY ce.created_at ASC
              ) AS timeline
       FROM courier_enforcement_appeals cea2
       JOIN courier_enforcement_actions cea ON cea.id = cea2.enforcement_action_id
       JOIN courier_profiles cp ON cp.id = cea2.courier_profile_id
       JOIN users u ON u.id = cp.user_id
       WHERE ($1::text IS NULL OR cea2.status = $1)
       ORDER BY cea2.submitted_at ASC
       LIMIT 500`,
      [status],
    );
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    securityLog.error('List admin courier enforcement appeals error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};

export const reviewAdminCourierEnforcementAppeal = async (req: Request, res: Response): Promise<void> => {
  const appealId = String(req.params.appealId || req.params.id || '').trim();
  const status = String(req.body?.status || '').trim().toLowerCase();
  const reviewNote = String(req.body?.review_note || req.body?.reviewNote || '').trim();
  if (!['in_review', 'approved', 'rejected'].includes(status)) {
    res.status(400).json({ success: false, data: null, message: 'status must be in_review, approved, or rejected', code: 'ERR_INVALID_REVIEW_STATUS' });
    return;
  }
  if (['approved', 'rejected'].includes(status) && reviewNote.length < 10) {
    res.status(400).json({ success: false, data: null, message: 'review_note minimal 10 karakter wajib diisi untuk keputusan final.', code: 'ERR_REVIEW_NOTE_REQUIRED' });
    return;
  }

  const actorId = getActorId(req);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const appealRes = await client.query(
      `SELECT cea2.*, cea.enforcement_type, cea.scope, cea.service_code, cea.status AS action_status,
              cea.restoration_snapshot, cea.courier_profile_id, cp.user_id
       FROM courier_enforcement_appeals cea2
       JOIN courier_enforcement_actions cea ON cea.id = cea2.enforcement_action_id
       JOIN courier_profiles cp ON cp.id = cea2.courier_profile_id
       WHERE cea2.id = $1
       FOR UPDATE OF cea2, cea, cp`,
      [appealId],
    );
    const appeal = appealRes.rows[0];
    if (!appeal) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Enforcement appeal not found', code: 'ERR_NOT_FOUND' });
      return;
    }
    if (['approved', 'rejected'].includes(appeal.status)) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, data: null, message: 'Appeal sudah memiliki keputusan final.', code: 'ERR_APPEAL_CLOSED' });
      return;
    }

    const finalDecision = ['approved', 'rejected'].includes(status);
    const updated = await client.query(
      `UPDATE courier_enforcement_appeals
       SET status = $1,
           review_note = COALESCE(NULLIF($2, ''), review_note),
           reviewed_at = CASE WHEN $3 THEN NOW() ELSE reviewed_at END,
           reviewed_by = CASE WHEN $3 THEN $4 ELSE reviewed_by END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [status, reviewNote, finalDecision, actorId, appealId],
    );
    await client.query(
      `INSERT INTO courier_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
       VALUES ($1, 'appeal_reviewed', $2, $3)`,
      [appeal.enforcement_action_id, actorId, JSON.stringify({ appeal_id: appeal.id, status, review_note: reviewNote || null })],
    );

    if (status === 'approved') {
      await client.query(
        `UPDATE courier_enforcement_actions
         SET status = 'revoked', revoked_by = $1, revoked_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [actorId, appeal.enforcement_action_id],
      );

      if (appeal.scope === 'capability' && appeal.restoration_snapshot?.capability?.status === 'enabled') {
        const otherAction = await client.query(
          `SELECT 1
           FROM courier_enforcement_actions
           WHERE id <> $1
             AND courier_profile_id = $2
             AND scope = 'capability'
             AND LOWER(service_code) = LOWER($3)
             AND status IN ('active', 'pending_safe_completion')
             AND effective_from <= NOW()
             AND (effective_until IS NULL OR effective_until > NOW())
           LIMIT 1`,
          [appeal.enforcement_action_id, appeal.courier_profile_id, appeal.service_code],
        );
        if (otherAction.rows.length === 0) {
          await client.query(
            `UPDATE courier_service_capabilities
             SET status = 'enabled',
                 eligibility_reason = NULLIF($1, ''),
                 suspension_reason = NULL,
                 paused_at = NULL,
                 paused_by = NULL,
                 approved_by = $2,
                 approved_at = COALESCE($3::timestamptz, NOW()),
                 updated_at = NOW()
             WHERE courier_profile_id = $4
               AND LOWER(service_code) = LOWER($5)
               AND $6 = 'enabled'`,
            [
              String(appeal.restoration_snapshot.capability.eligibility_reason || ''),
              appeal.restoration_snapshot.capability.approved_by || actorId,
              appeal.restoration_snapshot.capability.approved_at || null,
              appeal.courier_profile_id,
              appeal.service_code,
              appeal.restoration_snapshot.capability.status,
            ],
          );
        }
      }

      if (appeal.scope === 'account' && appeal.enforcement_type === 'suspension') {
        const otherAccountAction = await client.query(
          `SELECT 1
           FROM courier_enforcement_actions
           WHERE id <> $1
             AND courier_profile_id = $2
             AND scope = 'account'
             AND status IN ('active', 'pending_safe_completion')
             AND effective_from <= NOW()
             AND (effective_until IS NULL OR effective_until > NOW())
           LIMIT 1`,
          [appeal.enforcement_action_id, appeal.courier_profile_id],
        );
        const snapshot = appeal.restoration_snapshot || {};
        if (otherAccountAction.rows.length === 0 && snapshot.onboarding_status === 'ACTIVE' && snapshot.user_status === 'active') {
          await client.query(`SELECT set_config('app.actor_id', $1, TRUE), set_config('app.actor_reason', $2, TRUE)`, [
            actorId,
            'Approved enforcement appeal; restore previously approved account state',
          ]);
          await client.query(
            `UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'suspended'`,
            [appeal.user_id],
          );
          await client.query(
            `UPDATE courier_profiles
             SET onboarding_status = 'ACTIVE',
                 verification_status = 'approved',
                 is_verified = TRUE,
                 status = 'active',
                 updated_at = NOW(),
                 reviewed_at = NOW(),
                 reviewed_by = $2
             WHERE id = $1 AND onboarding_status = 'SUSPENDED'`,
            [appeal.courier_profile_id, actorId],
          );
        }
      }
      await client.query(
        `INSERT INTO courier_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
         VALUES ($1, 'revoked', $2, $3)`,
        [appeal.enforcement_action_id, actorId, JSON.stringify({ reason: 'approved_appeal', appeal_id: appeal.id })],
      );
    }

    await auditEnforcement(client, actorId, `courier.enforcement.appeal.${status}`, appeal.enforcement_action_id, {
      appeal_id: appeal.id,
      status,
      review_note: reviewNote || null,
    });
    await client.query('COMMIT');
    res.json({ success: true, data: { appeal: updated.rows[0], reinstatement: status === 'approved' }, message: 'Enforcement appeal reviewed' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    securityLog.error('Review admin courier enforcement appeal error:', { error: error.message, actor: actorId });
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};
