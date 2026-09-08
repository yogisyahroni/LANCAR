import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPES = ['merchant', 'branch', 'item', 'ads'];
const REASONS = ['safety', 'fraud_integrity', 'document_compliance', 'quality', 'marketplace_policy', 'other'];
const ACTIVE_ORDER_STATUSES = [
  'pending_merchant', 'preparing', 'ready_for_pickup', 'searching', 'pending_assignment',
  'assigned', 'accepted', 'pickup_arrived', 'picking_up', 'picked_up', 'inbound_origin',
  'outbound_origin', 'inbound_destination', 'outbound_destination', 'delivering', 'return_to_sender',
];

const actionSelect = `
  a.id, a.merchant_id, a.scope, a.target_branch_id, branch.name AS target_branch_name,
  a.target_menu_item_id, item.nama AS target_menu_item_name, a.capability,
  a.reason_category, a.reason_detail, a.evidence, a.merchant_message,
  a.remediation_message, a.disclosure_level, a.effective_from, a.effective_until,
  a.safe_order_policy, a.status,
  COALESCE((SELECT COUNT(*)::int FROM orders active_order
            WHERE merchant_enforcement_order_matches(a, active_order.id)), 0) AS active_order_count,
  a.created_by, a.revoked_by, a.revoked_at, a.created_at, a.updated_at`;

const actorOr401 = (req: Request, res: Response): string | null => {
  const actor = getActorId(req);
  if (!actor || !UUID_RE.test(actor)) {
    res.status(401).json({ success: false, error: 'Admin actor tidak valid', code: 'ERR_UNAUTHORIZED' });
    return null;
  }
  return actor;
};

const parseDate = (value: unknown, field: string): Date | null => {
  if (value == null || String(value).trim() === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} harus format RFC3339`);
  return parsed;
};

const validateActionInput = (body: any) => {
  const scope = String(body?.scope || '').trim().toLowerCase();
  const reasonCategory = String(body?.reason_category || body?.reasonCategory || '').trim().toLowerCase();
  const reasonDetail = String(body?.reason_detail || body?.reason || '').trim();
  const targetBranchId = body?.target_branch_id ? String(body.target_branch_id).trim() : null;
  const targetMenuItemId = body?.target_menu_item_id ? String(body.target_menu_item_id).trim() : null;
  const capability = body?.capability ? String(body.capability).trim().toLowerCase() : null;
  const effectiveFrom = parseDate(body?.effective_from || body?.effectiveFrom, 'effective_from') || new Date();
  const effectiveUntil = parseDate(body?.effective_until || body?.effectiveUntil, 'effective_until');
  const disclosureLevel = String(body?.disclosure_level || body?.disclosureLevel || 'actionable').trim().toLowerCase();
  const safeOrderPolicy = String(body?.safe_order_policy || body?.safeOrderPolicy || 'allow_active_order_completion').trim();
  const merchantMessage = body?.merchant_message == null ? null : String(body.merchant_message).trim();
  const remediationMessage = body?.remediation_message == null ? null : String(body.remediation_message).trim();
  const evidence = body?.evidence == null ? {} : body.evidence;

  if (!SCOPES.includes(scope)) throw new Error('scope harus merchant, branch, item, atau ads');
  if (!REASONS.includes(reasonCategory)) throw new Error('reason_category tidak valid');
  if (reasonDetail.length < 10 || reasonDetail.length > 2000) throw new Error('reason_detail harus 10-2000 karakter');
  if (effectiveUntil && effectiveUntil <= effectiveFrom) throw new Error('effective_until harus setelah effective_from');
  if (!['actionable', 'security_restricted'].includes(disclosureLevel)) throw new Error('disclosure_level tidak valid');
  if (!['allow_active_order_completion', 'immediate_safety_stop'].includes(safeOrderPolicy)) throw new Error('safe_order_policy tidak valid');
  if (targetBranchId && !UUID_RE.test(targetBranchId)) throw new Error('target_branch_id tidak valid');
  if (targetMenuItemId && !UUID_RE.test(targetMenuItemId)) throw new Error('target_menu_item_id tidak valid');
  if (scope === 'merchant' && (targetBranchId || targetMenuItemId || capability)) throw new Error('scope merchant tidak boleh memiliki target');
  if (scope === 'branch' && (!targetBranchId || targetMenuItemId || capability)) throw new Error('scope branch wajib target_branch_id');
  if (scope === 'item' && (!targetMenuItemId || targetBranchId || capability)) throw new Error('scope item wajib target_menu_item_id');
  if (scope === 'ads' && (targetBranchId || targetMenuItemId || capability !== 'ads')) throw new Error('scope ads wajib capability ads');
  if (merchantMessage !== null && (merchantMessage.length < 1 || merchantMessage.length > 500)) throw new Error('merchant_message maksimal 500 karakter');
  if (remediationMessage !== null && (remediationMessage.length < 1 || remediationMessage.length > 500)) throw new Error('remediation_message maksimal 500 karakter');
  if (typeof evidence !== 'object' || Array.isArray(evidence) || JSON.stringify(evidence).length > 10000) throw new Error('evidence harus object maksimal 10KB');
  return { scope, reasonCategory, reasonDetail, targetBranchId, targetMenuItemId, capability, effectiveFrom, effectiveUntil, disclosureLevel, safeOrderPolicy, merchantMessage, remediationMessage, evidence };
};

const countActiveOrders = async (client: any, merchantId: string, input: ReturnType<typeof validateActionInput>) => {
  let predicate = 'o.merchant_id = $1';
  const params: any[] = [merchantId, ACTIVE_ORDER_STATUSES];
  if (input.scope === 'branch') {
    predicate = `o.merchant_id = $1 AND EXISTS (
      SELECT 1 FROM food_order_items foi
      JOIN merchant_menu_items mi ON mi.id = foi.menu_item_id
      WHERE foi.order_id = o.id AND mi.branch_id = $3::uuid)`;
    params.push(input.targetBranchId);
  } else if (input.scope === 'item') {
    predicate = `o.merchant_id = $1 AND EXISTS (
      SELECT 1 FROM food_order_items foi
      WHERE foi.order_id = o.id AND foi.menu_item_id = $3::uuid)`;
    params.push(input.targetMenuItemId);
  }
  const result = await client.query(
    `SELECT COUNT(*)::int AS count FROM orders o
     WHERE o.service_sub_type = 'food_delivery'
       AND o.status = ANY($2::text[])
       AND ${predicate}`,
    params,
  );
  return Number(result.rows[0]?.count || 0);
};

export const listAdminMerchantEnforcementActions = async (req: Request, res: Response): Promise<void> => {
  const merchantId = String(req.params.id || req.query.merchant_id || '').trim();
  if (merchantId && !UUID_RE.test(merchantId)) {
    res.status(400).json({ success: false, error: 'Merchant id tidak valid' });
    return;
  }
  try {
    await db.query('SELECT refresh_merchant_enforcement_actions()');
    const params: any[] = [];
    const where = merchantId ? 'WHERE a.merchant_id = $1::uuid' : '';
    if (merchantId) params.push(merchantId);
    const result = await readDb.query(
      `SELECT ${actionSelect}
       FROM merchant_enforcement_actions a
       LEFT JOIN merchant_branches branch ON branch.id = a.target_branch_id
       LEFT JOIN merchant_menu_items item ON item.id = a.target_menu_item_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT 200`,
      params,
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('admin_merchant_enforcement_list_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ success: false, error: 'Gagal memuat merchant enforcement actions' });
  }
};

export const createAdminMerchantEnforcementAction = async (req: Request, res: Response): Promise<void> => {
  const actor = actorOr401(req, res);
  if (!actor) return;
  const merchantId = String(req.params.id || '').trim();
  if (!UUID_RE.test(merchantId)) {
    res.status(400).json({ success: false, error: 'Merchant id tidak valid' });
    return;
  }
  let input: ReturnType<typeof validateActionInput>;
  try {
    input = validateActionInput(req.body);
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message, code: 'ERR_INVALID_ENFORCEMENT' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const merchant = await client.query('SELECT id FROM merchants WHERE id = $1::uuid FOR UPDATE', [merchantId]);
    if (merchant.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Merchant tidak ditemukan', code: 'ERR_NOT_FOUND' });
      return;
    }
    if (input.scope === 'branch') {
      const target = await client.query('SELECT id FROM merchant_branches WHERE id = $1::uuid AND merchant_id = $2::uuid', [input.targetBranchId, merchantId]);
      if (target.rows.length === 0) throw new Error('branch bukan milik merchant ini');
    }
    if (input.scope === 'item') {
      const target = await client.query('SELECT id FROM merchant_menu_items WHERE id = $1::uuid AND merchant_id = $2::uuid', [input.targetMenuItemId, merchantId]);
      if (target.rows.length === 0) throw new Error('menu item bukan milik merchant ini');
    }

    const duplicate = await client.query(
      `SELECT id FROM merchant_enforcement_actions
       WHERE merchant_id = $1::uuid AND scope = $2
         AND target_branch_id IS NOT DISTINCT FROM $3::uuid
         AND target_menu_item_id IS NOT DISTINCT FROM $4::uuid
         AND LOWER(COALESCE(capability, '')) = LOWER(COALESCE($5, ''))
         AND status IN ('scheduled', 'pending_safe_completion', 'active')
       LIMIT 1`,
      [merchantId, input.scope, input.targetBranchId, input.targetMenuItemId, input.capability],
    );
    if (duplicate.rows.length > 0) throw new Error('target sudah memiliki enforcement aktif');

    const activeOrderCount = await countActiveOrders(client, merchantId, input);
    const now = new Date();
    const status = input.effectiveFrom > now
      ? 'scheduled'
      : activeOrderCount > 0 && input.safeOrderPolicy !== 'immediate_safety_stop'
        ? 'pending_safe_completion'
        : 'active';
    const actionResult = await client.query(
      `INSERT INTO merchant_enforcement_actions (
         merchant_id, scope, target_branch_id, target_menu_item_id, capability,
         reason_category, reason_detail, evidence, merchant_message, remediation_message,
         disclosure_level, effective_from, effective_until, safe_order_policy, status, created_by
       ) VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16::uuid)
       RETURNING id`,
      [merchantId, input.scope, input.targetBranchId, input.targetMenuItemId, input.capability,
        input.reasonCategory, input.reasonDetail, JSON.stringify(input.evidence), input.merchantMessage,
        input.remediationMessage, input.disclosureLevel, input.effectiveFrom, input.effectiveUntil,
        input.safeOrderPolicy, status, actor],
    );
    const actionId = actionResult.rows[0].id;
    await client.query(
      `INSERT INTO merchant_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
       VALUES ($1::uuid, 'created', $2::uuid, $3::jsonb)`,
      [actionId, actor, JSON.stringify({ active_order_count: activeOrderCount, safe_order_policy: input.safeOrderPolicy, source: 'admin' })],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1::uuid, 'admin_merchant_enforcement_created', $2::uuid, $3::text)`,
      [actor, merchantId, JSON.stringify({ action_id: actionId, scope: input.scope, reason_category: input.reasonCategory, reason_detail: input.reasonDetail, evidence: input.evidence, effective_from: input.effectiveFrom, effective_until: input.effectiveUntil, safe_order_policy: input.safeOrderPolicy, status })],
    );
    await client.query('COMMIT');
    securityLog.info('admin_merchant_enforcement_created', { actor, merchant_id: merchantId, action_id: actionId, scope: input.scope, status });
    res.status(201).json({ success: true, action_id: actionId, status, active_order_count: activeOrderCount, server_authoritative: true });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('admin_merchant_enforcement_create_failed', { error: error.message, actor, merchant_id: merchantId });
    const status = error?.code === '23505' ? 409 : String(error?.message || '').includes('target sudah') ? 409 : 400;
    res.status(status).json({ success: false, error: error.message || 'Gagal membuat merchant enforcement action' });
  } finally {
    client.release();
  }
};

export const listAdminMerchantEnforcementAppeals = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(
      `SELECT appeal.id, appeal.enforcement_action_id, appeal.merchant_id, appeal.reason,
              appeal.status, appeal.review_note, appeal.submitted_at, appeal.reviewed_at,
              appeal.reviewed_by, action.scope, action.reason_category, action.reason_detail
       FROM merchant_enforcement_appeals appeal
       JOIN merchant_enforcement_actions action ON action.id = appeal.enforcement_action_id
       WHERE ($1::uuid IS NULL OR appeal.merchant_id = $1::uuid)
       ORDER BY appeal.submitted_at ASC
       LIMIT 200`,
      [req.query.merchant_id ? String(req.query.merchant_id) : null],
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('admin_merchant_enforcement_appeals_list_failed', { error: error.message, actor: getActorId(req) });
    res.status(500).json({ success: false, error: 'Gagal memuat appeal merchant enforcement' });
  }
};

export const reviewAdminMerchantEnforcementAppeal = async (req: Request, res: Response): Promise<void> => {
  const actor = actorOr401(req, res);
  if (!actor) return;
  const appealId = String(req.params.appealId || '').trim();
  const status = String(req.body?.status || '').trim().toLowerCase();
  const reviewNote = String(req.body?.review_note || req.body?.reviewNote || '').trim();
  if (!UUID_RE.test(appealId) || !['approved', 'rejected'].includes(status) || reviewNote.length < 10 || reviewNote.length > 2000) {
    res.status(400).json({ success: false, error: 'appealId, status approved/rejected, dan review_note 10-2000 karakter wajib valid' });
    return;
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const appealResult = await client.query(
      `SELECT appeal.id, appeal.enforcement_action_id, appeal.merchant_id, action.status AS action_status
       FROM merchant_enforcement_appeals appeal
       JOIN merchant_enforcement_actions action ON action.id = appeal.enforcement_action_id
       WHERE appeal.id = $1::uuid AND appeal.status IN ('submitted', 'in_review')
       FOR UPDATE OF appeal, action`,
      [appealId],
    );
    const appeal = appealResult.rows[0];
    if (!appeal) throw new Error('appeal tidak ditemukan atau sudah ditutup');
    const updatedAppeal = await client.query(
      `UPDATE merchant_enforcement_appeals
       SET status = $2, review_note = $3, reviewed_at = NOW(), reviewed_by = $4::uuid, updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id, enforcement_action_id, merchant_id, reason, status, review_note, submitted_at, reviewed_at, reviewed_by`,
      [appealId, status, reviewNote, actor],
    );
    if (status === 'approved') {
      await client.query(
        `UPDATE merchant_enforcement_actions
         SET status = 'revoked', revoked_by = $2::uuid, revoked_at = NOW(), updated_at = NOW()
         WHERE id = $1::uuid AND status IN ('scheduled', 'pending_safe_completion', 'active')`,
        [appeal.enforcement_action_id, actor],
      );
    }
    await client.query(
      `INSERT INTO merchant_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
       VALUES ($1::uuid, 'appeal_reviewed', $2::uuid, $3::jsonb)`,
      [appeal.enforcement_action_id, actor, JSON.stringify({ appeal_id: appealId, status, review_note: reviewNote, source: 'admin' })],
    );
    if (status === 'approved') {
      await client.query(
        `INSERT INTO merchant_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
         VALUES ($1::uuid, 'revoked', $2::uuid, $3::jsonb)`,
        [appeal.enforcement_action_id, actor, JSON.stringify({ source: 'approved_appeal', appeal_id: appealId })],
      );
    }
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1::uuid, 'admin_merchant_enforcement_appeal_reviewed', $2::uuid, $3::text)`,
      [actor, appeal.merchant_id, JSON.stringify({ appeal_id: appealId, action_id: appeal.enforcement_action_id, status, review_note: reviewNote })],
    );
    await client.query('COMMIT');
    res.json({ success: true, data: updatedAppeal.rows[0], enforcement_revoked: status === 'approved', server_authoritative: true });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    const code = String(error?.message || '').includes('tidak ditemukan') ? 404 : 400;
    res.status(code).json({ success: false, error: error.message || 'Gagal me-review appeal merchant enforcement' });
  } finally {
    client.release();
  }
};
