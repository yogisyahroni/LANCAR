import crypto from 'crypto';
import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { getActorId } from '../utils/authUtils';
import { saveSecureUploadBuffer } from '../security/uploadSecurity';
import { securityLog } from '../security/logRedaction';
import { safetyCenterPolicy, safetySlaDueAt, SAFETY_SLA_MINUTES } from '../services/safetyIncidentPolicy';

const TERMINAL_ORDER_STATES = ['delivered', 'completed', 'pod_completed', 'cancelled', 'failed', 'returned', 'rejected'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
type Severity = typeof SEVERITIES[number];

const actorId = (req: Request) => getActorId(req) || req.user?.id || '';
const publicBaseUrl = () => process.env.SAFETY_PUBLIC_BASE_URL || 'https://app.bawain.my.id';
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const contactCipher = (value: string, mode: 'encrypt' | 'decrypt') => {
  const secret = String(process.env.SAFETY_CONTACT_ENCRYPTION_KEY || '').trim();
  if (!secret) throw new Error('SAFETY_CONTACT_ENCRYPTION_KEY is not configured');
  const key = crypto.createHash('sha256').update(secret).digest();
  if (mode === 'encrypt') {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }
  const packed = Buffer.from(value, 'base64');
  if (packed.length < 28) throw new Error('invalid contact ciphertext');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
};

const maskContact = (value: string, channel: 'PHONE' | 'EMAIL') => channel === 'EMAIL'
  ? value.replace(/^(.{1,2}).*(@.*)$/, '$1***$2')
  : `${value.slice(0, 3)}***${value.slice(-2)}`;

export const listCustomerEmergencyContacts = async (req: Request, res: Response) => {
  const userId = actorId(req);
  if (!isUuid(userId)) return res.status(400).json({ success: false, code: 'ERR_INVALID_ID' });
  try {
    const result = await readDb.query(`SELECT id, display_name, channel, contact_ciphertext, is_active, created_at, updated_at FROM safety_emergency_contacts WHERE user_id = $1 AND is_active ORDER BY created_at ASC`, [userId]);
    const data = result.rows.map((row) => {
      try {
        const plain = contactCipher(Buffer.from(row.contact_ciphertext).toString('base64'), 'decrypt') as string;
        return { id: row.id, display_name: row.display_name, channel: row.channel, contact_hint: maskContact(plain, row.channel), is_active: row.is_active, created_at: row.created_at, updated_at: row.updated_at };
      } catch {
        return { id: row.id, display_name: row.display_name, channel: row.channel, contact_hint: 'configured', is_active: row.is_active, created_at: row.created_at, updated_at: row.updated_at };
      }
    });
    return res.json({ success: true, data });
  } catch (error) {
    securityLog.error('LIST_CUSTOMER_EMERGENCY_CONTACTS_FAILED', { error, user_id: userId });
    return res.status(500).json({ success: false, code: 'ERR_EMERGENCY_CONTACTS_UNAVAILABLE' });
  }
};

export const createCustomerEmergencyContact = async (req: Request, res: Response) => {
  const userId = actorId(req);
  const displayName = String(req.body?.display_name || '').trim().slice(0, 120);
  const channel = String(req.body?.channel || '').trim().toUpperCase() as 'PHONE' | 'EMAIL';
  const value = String(req.body?.value || '').trim();
  if (!isUuid(userId) || !displayName || !['PHONE', 'EMAIL'].includes(channel) || !value || value.length > 254) return res.status(400).json({ success: false, code: 'ERR_INVALID_EMERGENCY_CONTACT' });
  if (channel === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return res.status(400).json({ success: false, code: 'ERR_INVALID_EMERGENCY_CONTACT' });
  if (channel === 'PHONE' && !/^\+?[0-9 ()-]{7,24}$/.test(value)) return res.status(400).json({ success: false, code: 'ERR_INVALID_EMERGENCY_CONTACT' });
  try {
    const ciphertext = contactCipher(value, 'encrypt');
    const result = await db.query(`INSERT INTO safety_emergency_contacts (user_id, display_name, channel, contact_ciphertext) VALUES ($1,$2,$3,$4) RETURNING id, display_name, channel, is_active, created_at`, [userId, displayName, channel, ciphertext]);
    return res.status(201).json({ success: true, data: { ...result.rows[0], contact_hint: maskContact(value, channel) } });
  } catch (error) {
    securityLog.error('CREATE_CUSTOMER_EMERGENCY_CONTACT_FAILED', { error, user_id: userId });
    return res.status(503).json({ success: false, code: 'ERR_EMERGENCY_CONTACTS_UNAVAILABLE' });
  }
};

export const revokeCustomerEmergencyContact = async (req: Request, res: Response) => {
  const userId = actorId(req);
  const contactId = String(req.params.id || '').trim();
  if (!isUuid(userId) || !isUuid(contactId)) return res.status(400).json({ success: false, code: 'ERR_INVALID_ID' });
  const result = await db.query(`UPDATE safety_emergency_contacts SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND user_id = $2 AND is_active RETURNING id`, [contactId, userId]);
  return result.rows.length ? res.json({ success: true, data: { id: contactId, revoked: true } }) : res.status(404).json({ success: false, code: 'ERR_EMERGENCY_CONTACT_NOT_FOUND' });
};

const readActiveOrder = async (orderId: string, userId: string, role: 'customer' | 'courier') => {
  const ownership = role === 'customer' ? 'o.customer_id = $2' : 'EXISTS (SELECT 1 FROM order_legs ol WHERE ol.order_id = o.id AND ol.courier_id = $2)';
  const result = await readDb.query(
    `SELECT o.id, o.service_code, o.status, o.market_code
       FROM orders o
      WHERE o.id = $1 AND ${ownership}
        AND LOWER(COALESCE(o.status::text, '')) <> ALL($3::text[])
      LIMIT 1`,
    [orderId, userId, TERMINAL_ORDER_STATES],
  );
  return result.rows[0] || null;
};

const incidentResponse = (row: any, req: Request) => ({
  id: row.id,
  order_id: row.order_id,
  service_code: row.service_code,
  market_code: row.market_code,
  category: row.category,
  severity: row.severity,
  state: row.state,
  escalation_state: row.escalation_state,
  sla_due_at: safetySlaDueAt(row.severity as Severity, new Date(row.created_at)).toISOString(),
  created_at: row.created_at,
  // Exact coordinates are only revealed to the safety role after an explicit
  // elevated request. The ordinary customer/courier response remains scoped.
  ...(req.user?.role === 'ops_security' || req.user?.role === 'super_admin' ? { latitude: row.latitude, longitude: row.longitude } : {}),
});

export const getCustomerSafetyCenter = async (req: Request, res: Response) => {
  const userId = actorId(req);
  const orderId = String(req.params.orderId || '').trim();
  if (!isUuid(userId) || !isUuid(orderId)) return res.status(400).json({ success: false, code: 'ERR_INVALID_ID' });
  try {
    const order = await readActiveOrder(orderId, userId, 'customer');
    if (!order) return res.status(404).json({ success: false, code: 'ERR_ORDER_NOT_FOUND' });
    const incidents = await readDb.query(
      `SELECT id, order_id, service_code, market_code, category, severity, state, escalation_state, latitude, longitude, created_at
         FROM safety_incidents WHERE order_id = $1 AND reporter_id = $2 ORDER BY created_at DESC LIMIT 20`,
      [orderId, userId],
    );
    return res.json({
      success: true,
      data: {
        active_order_reachable: true,
        order: { id: order.id, service_code: order.service_code, status: order.status, market_code: order.market_code },
        policy: safetyCenterPolicy({ sosConfigured: Boolean(process.env.EMERGENCY_PROVIDER_URL) }),
        incidents: incidents.rows.map((row) => incidentResponse(row, req)),
      },
    });
  } catch (error) {
    securityLog.error('GET_CUSTOMER_SAFETY_CENTER_FAILED', { error, order_id: orderId });
    return res.status(500).json({ success: false, code: 'ERR_SAFETY_CENTER_UNAVAILABLE' });
  }
};

export const createCustomerSafetyIncident = async (req: Request, res: Response) => {
  const userId = actorId(req);
  const orderId = String(req.params.orderId || req.body?.order_id || '').trim();
  const category = String(req.body?.category || '').trim().slice(0, 64);
  const severity = String(req.body?.severity || 'HIGH').trim().toUpperCase() as Severity;
  const latitude = req.body?.latitude == null ? null : Number(req.body.latitude);
  const longitude = req.body?.longitude == null ? null : Number(req.body.longitude);
  if (!isUuid(userId) || !isUuid(orderId) || !category || !SEVERITIES.includes(severity)) return res.status(400).json({ success: false, code: 'ERR_INVALID_SAFETY_REQUEST' });
  const invalidLocation = (latitude == null) !== (longitude == null)
    || (latitude !== null && longitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180));
  if (invalidLocation) {
    return res.status(400).json({ success: false, code: 'ERR_INVALID_LOCATION' });
  }
  try {
    const order = await readActiveOrder(orderId, userId, 'customer');
    if (!order) return res.status(404).json({ success: false, code: 'ERR_ORDER_NOT_FOUND' });
    const result = await db.query(
      `INSERT INTO safety_incidents
        (reporter_id, order_id, service_code, market_code, category, severity, escalation_state, latitude, longitude, location_recorded_at, context)
       VALUES ($1, $2, $3, $4, $5, $6, 'NOT_ESCALATED', $7, $8, CASE WHEN $7 IS NULL THEN NULL ELSE NOW() END, $9::jsonb)
       RETURNING id, order_id, service_code, market_code, category, severity, state, escalation_state, latitude, longitude, created_at`,
      [userId, orderId, order.service_code || null, order.market_code || 'id-jk', category, severity, latitude, longitude, JSON.stringify({ source: 'customer_safety_center', message: String(req.body?.message || '').trim().slice(0, 500) })],
    );
    return res.status(201).json({ success: true, data: incidentResponse(result.rows[0], req), escalation: 'recorded' });
  } catch (error) {
    securityLog.error('CREATE_CUSTOMER_SAFETY_INCIDENT_FAILED', { error, order_id: orderId });
    return res.status(500).json({ success: false, code: 'ERR_SAFETY_INCIDENT_UNAVAILABLE' });
  }
};

export const createCourierSafetyIncident = async (req: Request, res: Response) => {
  const userId = actorId(req);
  const orderId = String(req.params.orderId || req.body?.order_id || '').trim();
  const category = String(req.body?.category || '').trim().slice(0, 64);
  const severity = String(req.body?.severity || 'HIGH').trim().toUpperCase() as Severity;
  if (!isUuid(userId) || !isUuid(orderId) || !category || !SEVERITIES.includes(severity)) return res.status(400).json({ success: false, code: 'ERR_INVALID_SAFETY_REQUEST' });
  try {
    const order = await readActiveOrder(orderId, userId, 'courier');
    if (!order) return res.status(404).json({ success: false, code: 'ERR_ORDER_NOT_FOUND' });
    const result = await db.query(
      `INSERT INTO safety_incidents (reporter_id, order_id, service_code, market_code, category, severity, escalation_state, context)
       VALUES ($1, $2, $3, $4, $5, $6, 'NOT_ESCALATED', $7::jsonb)
       RETURNING id, order_id, service_code, market_code, category, severity, state, escalation_state, created_at`,
      [userId, orderId, order.service_code || null, order.market_code || 'id-jk', category, severity, JSON.stringify({ source: 'courier_safety_center', message: String(req.body?.message || '').trim().slice(0, 500), active_order_preserved: true })],
    );
    return res.status(201).json({ success: true, data: incidentResponse(result.rows[0], req), order_action: 'unchanged' });
  } catch (error) {
    securityLog.error('CREATE_COURIER_SAFETY_INCIDENT_FAILED', { error, order_id: orderId });
    return res.status(500).json({ success: false, code: 'ERR_SAFETY_INCIDENT_UNAVAILABLE' });
  }
};

export const getCourierSafetyCenter = async (req: Request, res: Response) => {
  const userId = actorId(req);
  const orderId = String(req.params.orderId || '').trim();
  if (!isUuid(userId) || !isUuid(orderId)) return res.status(400).json({ success: false, code: 'ERR_INVALID_ID' });
  try {
    const order = await readActiveOrder(orderId, userId, 'courier');
    if (!order) return res.status(404).json({ success: false, code: 'ERR_ORDER_NOT_FOUND' });
    const incidents = await readDb.query('SELECT id, order_id, service_code, market_code, category, severity, state, escalation_state, created_at FROM safety_incidents WHERE order_id = $1 AND reporter_id = $2 ORDER BY created_at DESC LIMIT 20', [orderId, userId]);
    return res.json({ success: true, data: { active_order_reachable: true, order: { id: order.id, service_code: order.service_code, status: order.status }, policy: safetyCenterPolicy({ sosConfigured: Boolean(process.env.EMERGENCY_PROVIDER_URL) }), incidents: incidents.rows.map((row) => incidentResponse(row, req)) } });
  } catch (error) {
    securityLog.error('GET_COURIER_SAFETY_CENTER_FAILED', { error, order_id: orderId });
    return res.status(500).json({ success: false, code: 'ERR_SAFETY_CENTER_UNAVAILABLE' });
  }
};

export const triggerCustomerSOS = async (req: Request, res: Response) => {
  const userId = actorId(req);
  const orderId = String(req.params.orderId || '').trim();
  if (!isUuid(userId) || !isUuid(orderId)) return res.status(400).json({ success: false, code: 'ERR_INVALID_ID' });
  try {
    const order = await readActiveOrder(orderId, userId, 'customer');
    if (!order) return res.status(404).json({ success: false, code: 'ERR_ORDER_NOT_FOUND' });
    const result = await db.query(
      `INSERT INTO safety_incidents (reporter_id, order_id, service_code, market_code, category, severity, escalation_state, context)
       VALUES ($1, $2, $3, $4, 'EMERGENCY_SOS', 'CRITICAL', $5, $6::jsonb)
       RETURNING id, order_id, service_code, market_code, category, severity, state, escalation_state, created_at`,
      [userId, orderId, order.service_code || null, order.market_code || 'id-jk', process.env.EMERGENCY_PROVIDER_URL ? 'PENDING_PROVIDER' : 'FALLBACK_INSTRUCTIONS', JSON.stringify({ source: 'customer_sos', provider_configured: Boolean(process.env.EMERGENCY_PROVIDER_URL) })],
    );
    const configured = Boolean(process.env.EMERGENCY_PROVIDER_URL);
    return res.status(201).json({ success: true, data: incidentResponse(result.rows[0], req), escalation: configured ? 'pending_provider' : 'fallback_instructions', provider_response_claimed: false });
  } catch (error) {
    securityLog.error('TRIGGER_CUSTOMER_SOS_FAILED', { error, order_id: orderId });
    return res.status(500).json({ success: false, code: 'ERR_SOS_UNAVAILABLE' });
  }
};

export const createCustomerSafetyShare = async (req: Request, res: Response) => {
  const userId = actorId(req);
  const orderId = String(req.params.orderId || '').trim();
  if (!isUuid(userId) || !isUuid(orderId)) return res.status(400).json({ success: false, code: 'ERR_INVALID_ID' });
  try {
    const order = await readActiveOrder(orderId, userId, 'customer');
    if (!order) return res.status(404).json({ success: false, code: 'ERR_ORDER_NOT_FOUND' });
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO safety_share_tokens (order_id, issuer_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [orderId, userId, crypto.createHash('sha256').update(token).digest('hex'), expiresAt],
    );
    return res.status(201).json({ success: true, data: { url: `${publicBaseUrl()}/safety/share/${token}`, expires_at: expiresAt.toISOString(), can_mutate: false } });
  } catch (error) {
    securityLog.error('CREATE_CUSTOMER_SAFETY_SHARE_FAILED', { error, order_id: orderId });
    return res.status(500).json({ success: false, code: 'ERR_SAFETY_SHARE_UNAVAILABLE' });
  }
};

export const revokeCustomerSafetyShare = async (req: Request, res: Response) => {
  const userId = actorId(req);
  const tokenId = String(req.params.tokenId || '').trim();
  if (!isUuid(userId) || !isUuid(tokenId)) return res.status(400).json({ success: false, code: 'ERR_INVALID_ID' });
  const result = await db.query('UPDATE safety_share_tokens SET revoked_at = NOW() WHERE id = $1 AND issuer_id = $2 AND revoked_at IS NULL RETURNING id', [tokenId, userId]);
  return result.rows.length ? res.json({ success: true, data: { revoked: true } }) : res.status(404).json({ success: false, code: 'ERR_SHARE_NOT_FOUND' });
};

export const getPublicSafetyShare = async (req: Request, res: Response) => {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return res.status(404).json({ success: false, code: 'ERR_NOT_FOUND' });
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await readDb.query(
    `SELECT o.id AS order_id, o.status, o.service_code, o.updated_at, s.expires_at
       FROM safety_share_tokens s JOIN orders o ON o.id = s.order_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW() LIMIT 1`,
    [hash],
  );
  if (!result.rows[0]) return res.status(404).json({ success: false, code: 'ERR_NOT_FOUND' });
  const row = result.rows[0];
  return res.json({ success: true, data: { order_id: row.order_id, status: row.status, service_code: row.service_code, last_updated_at: row.updated_at, expires_at: row.expires_at, can_mutate: false } });
};

export const listAdminSafetyIncidents = async (_req: Request, res: Response) => {
  try {
    const result = await readDb.query(
      `SELECT id, order_id, reporter_id, service_code, market_code, category, severity, state, escalation_state, latitude, longitude, created_at, updated_at
         FROM safety_incidents
        WHERE state NOT IN ('RESOLVED','DISMISSED')
        ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END, created_at ASC
        LIMIT 200`,
    );
    const data = result.rows
      .map((row) => ({
        ...row,
        sla_minutes: SAFETY_SLA_MINUTES[row.severity as Severity],
        sla_due_at: safetySlaDueAt(row.severity as Severity, new Date(row.created_at)).toISOString(),
      }))
      .sort((left, right) => new Date(left.sla_due_at).getTime() - new Date(right.sla_due_at).getTime());
    return res.json({ success: true, data });
  } catch (error) {
    securityLog.error('LIST_ADMIN_SAFETY_INCIDENTS_FAILED', { error });
    return res.status(500).json({ success: false, data: [], code: 'ERR_SAFETY_QUEUE_UNAVAILABLE' });
  }
};

export const getAdminSafetyIncident = async (req: Request, res: Response) => {
  const incidentId = String(req.params.id || '').trim();
  if (!isUuid(incidentId)) return res.status(400).json({ success: false, code: 'ERR_INVALID_ID' });
  try {
    const [incident, evidence, actions, communications] = await Promise.all([
      readDb.query(`SELECT id, order_id, reporter_id, counterparty_id, service_code, market_code, category, severity, state, escalation_state, latitude, longitude, location_accuracy_m, location_recorded_at, context, created_at, updated_at, resolved_at FROM safety_incidents WHERE id = $1`, [incidentId]),
      readDb.query(`SELECT id, actor_id, object_key, sha256, content_type, size_bytes, redacted_object_key, retention_until, legal_hold, created_at FROM safety_evidence WHERE incident_id = $1 ORDER BY created_at ASC`, [incidentId]),
      readDb.query(`SELECT id, actor_id, action, payload, created_at FROM audit_logs WHERE target_id = $1 ORDER BY created_at ASC`, [incidentId]),
      readDb.query(`SELECT id, sender_id, message_type, created_at FROM order_chats WHERE order_id = (SELECT order_id FROM safety_incidents WHERE id = $1) ORDER BY created_at ASC LIMIT 200`, [incidentId]),
    ]);
    if (!incident.rows[0]) return res.status(404).json({ success: false, code: 'ERR_NOT_FOUND' });
    const row = incident.rows[0];
    const canRevealLocation = req.user?.role === 'ops_security' || req.user?.role === 'super_admin';
    return res.json({
      success: true,
      data: {
        incident: { ...row, ...(canRevealLocation ? {} : { latitude: null, longitude: null }) },
        evidence: evidence.rows.map(({ object_key: _objectKey, ...safe }) => safe),
        reviewer_actions: actions.rows,
        communications: communications.rows,
      },
    });
  } catch (error) {
    securityLog.error('GET_ADMIN_SAFETY_INCIDENT_FAILED', { error, incident_id: incidentId });
    return res.status(500).json({ success: false, code: 'ERR_SAFETY_DETAIL_UNAVAILABLE' });
  }
};

export const updateAdminSafetyIncident = async (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  const state = String(req.body?.state || '').trim().toUpperCase();
  const note = String(req.body?.note || '').trim().slice(0, 500);
  if (!isUuid(id) || !['ACKNOWLEDGED', 'ESCALATED', 'RESOLVED', 'REOPENED', 'DISMISSED'].includes(state)) return res.status(400).json({ success: false, code: 'ERR_INVALID_SAFETY_STATE' });
  try {
    const result = await db.query(
      `UPDATE safety_incidents SET state = $2, escalation_state = CASE WHEN $2 = 'ESCALATED' THEN 'OPS_ESCALATED' ELSE escalation_state END, resolved_at = CASE WHEN $2 IN ('RESOLVED','DISMISSED') THEN COALESCE(resolved_at, NOW()) ELSE NULL END, updated_at = NOW(), context = jsonb_set(COALESCE(context, '{}'::jsonb), '{last_action}', $3::jsonb, true) WHERE id = $1 RETURNING id, state, escalation_state, resolved_at, updated_at`,
      [id, state, JSON.stringify({ actor_id: actorId(req), state, note, acted_at: new Date().toISOString() })],
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, code: 'ERR_NOT_FOUND' });
    await db.query(`INSERT INTO audit_logs (actor_id, action, target_id, payload) VALUES ($1, $2, $3, $4)`, [actorId(req), `safety.incident.${state.toLowerCase()}`, id, JSON.stringify({ note })]);
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    securityLog.error('UPDATE_ADMIN_SAFETY_INCIDENT_FAILED', { error, incident_id: id });
    return res.status(500).json({ success: false, code: 'ERR_SAFETY_UPDATE_UNAVAILABLE' });
  }
};

export const uploadSafetyEvidence = async (req: Request, res: Response) => {
  const incidentId = String(req.params.id || '').trim();
  if (!isUuid(incidentId) || !req.file || !req.file.checksumSha256 || !req.file.safeFileName) return res.status(400).json({ success: false, code: 'ERR_INVALID_EVIDENCE' });
  try {
    const incident = await readDb.query('SELECT id FROM safety_incidents WHERE id = $1', [incidentId]);
    if (!incident.rows[0]) return res.status(404).json({ success: false, code: 'ERR_NOT_FOUND' });
    const saved = saveSecureUploadBuffer(req.file, 'safety-evidence');
    const retentionUntil = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    const result = await db.query(
      `INSERT INTO safety_evidence (incident_id, actor_id, object_key, sha256, content_type, size_bytes, retention_until) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, incident_id, sha256, content_type, size_bytes, retention_until`,
      [incidentId, actorId(req), saved.storageKey, req.file.checksumSha256, req.file.detectedMimeType || req.file.mimetype, req.file.size, retentionUntil],
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    securityLog.error('UPLOAD_SAFETY_EVIDENCE_FAILED', { error, incident_id: incidentId });
    return res.status(500).json({ success: false, code: 'ERR_EVIDENCE_UNAVAILABLE' });
  }
};
