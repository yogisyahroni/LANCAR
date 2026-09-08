import { PoolClient } from 'pg';
import { Request, Response } from 'express';
import { z } from 'zod';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import {
  SUPPORT_ACTIONS,
  SUPPORT_CASE_STATUSES,
  SUPPORT_REFERENCE_TYPES,
  SupportAction,
  SupportCasePolicy,
  canViewRestrictedSupportData,
  getSupportCasePolicy,
  isRestrictedSupportReference,
  isSupportStaffRole,
} from '../services/supportCasePolicy';

const SUPPORT_STAFF_ROLES = [
  'super_admin',
  'ops_security',
  'ops_admin',
  'finance_admin',
  'finance',
  'cs_agent',
  'zone_manager',
];

const FINANCIAL_ACTIONS = new Set<SupportAction>(['refund', 'compensate']);
const RESTRICTED_FINANCIAL_ROLES = new Set(['super_admin', 'finance_admin', 'finance']);
const CASE_STATUS_SET = new Set<string>(SUPPORT_CASE_STATUSES);

const createCaseSchema = z.object({
  category: z.string().trim().min(2).max(80),
  subject: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(4000),
  service_code: z.string().trim().min(2).max(80).default('general'),
  market_code: z.string().trim().regex(/^[a-z]{2}-[a-z0-9-]+$/i).default('id-jk'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  links: z.array(z.object({
    reference_type: z.enum(SUPPORT_REFERENCE_TYPES),
    reference_id: z.string().trim().min(1).max(160),
    label: z.string().trim().max(160).optional(),
  })).max(20).default([]),
});

const updateCaseSchema = z.object({
  status: z.enum(SUPPORT_CASE_STATUSES).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  escalation_level: z.number().int().min(0).max(5).optional(),
  sla_due_at: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(1000).optional(),
});

const actionSchema = z.object({
  action: z.enum(SUPPORT_ACTIONS),
  reason: z.string().trim().min(10).max(1000),
  assigned_to: z.string().uuid().nullable().optional(),
  refund_mode: z.enum(['full', 'partial']).default('full'),
  refund_items: z.array(z.object({
    item_id: z.string().trim().min(1).max(160),
    qty: z.number().int().positive().max(1000),
  })).max(100).default([]),
  include_delivery_fee: z.boolean().default(false),
});

type CaseRow = {
  id: string;
  case_number: string;
  requester_id: string;
  requester_role: string;
  category: string;
  subject: string;
  description: string;
  service_code: string;
  market_code: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  assigned_to_name?: string | null;
  escalation_level: number;
  sla_due_at: Date;
  resolved_at: Date | null;
  reopened_at: Date | null;
  reopen_count: number;
  created_at: Date;
  updated_at: Date;
};

type CaseLinkRow = {
  id: string;
  reference_type: string;
  reference_id: string;
  reference_label: string | null;
  created_at: Date;
};

type CaseEventRow = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_role: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type CaseActionRow = {
  id: string;
  idempotency_key: string;
  action_type: string;
  status: string;
  requested_by: string;
  amount_idr: number | null;
  external_reference: string | null;
  result_metadata: Record<string, unknown>;
  error_code: string | null;
  created_at: Date;
  updated_at: Date;
};

type AuthorityContext = {
  orderId: string | null;
  orderStatus: string | null;
  paymentStatus: string | null;
};

const readHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const actorId = (req: Request) => req.user?.id || null;
const actorRole = (req: Request) => req.user?.role || 'unknown';

const redactSupportText = (value: string) => value
  .replace(/\b(?:\d[ -]?){13,19}\b/g, '[REDACTED_PAYMENT_REFERENCE]')
  .replace(/\b(?:bearer|token|api[_ -]?key)\s*[:=]?\s*[^\s,;]+/gi, '[REDACTED_SECRET]');

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const parseCaseId = (value: string) => (isUuid(value) ? value : null);

const parseError = (error: unknown) => error instanceof Error ? error.message : 'Unexpected support case error';

const sendValidationError = (res: Response, parsed: { success: false; error: z.ZodError }) => {
  res.status(400).json({
    success: false,
    code: 'ERR_SUPPORT_CASE_PAYLOAD',
    error: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
};

const findCase = async (caseId: string, useWriter = false) => {
  const executor = useWriter ? db : readDb;
  const result = await executor.query<CaseRow>(
    `SELECT sc.id,
            sc.case_number,
            sc.requester_id,
            sc.requester_role,
            sc.category,
            sc.subject,
            sc.description,
            sc.service_code,
            sc.market_code,
            sc.priority,
            sc.status,
            sc.assigned_to,
            assigned.full_name AS assigned_to_name,
            sc.escalation_level,
            sc.sla_due_at,
            sc.resolved_at,
            sc.reopened_at,
            sc.reopen_count,
            sc.created_at,
            sc.updated_at
       FROM support_cases sc
       LEFT JOIN users assigned ON assigned.id = sc.assigned_to
      WHERE sc.id = $1
      LIMIT 1`,
    [caseId],
  );
  return result.rows[0] || null;
};

const findAuthorityContext = async (caseId: string, useWriter = false): Promise<AuthorityContext> => {
  const executor = useWriter ? db : readDb;
  const linked = await executor.query<{ reference_type: string; reference_id: string }>(
    `SELECT reference_type, reference_id
       FROM support_case_links
      WHERE case_id = $1
      ORDER BY created_at ASC`,
    [caseId],
  );

  let orderId: string | null = null;
  for (const link of linked.rows) {
    if (link.reference_type === 'order' && isUuid(link.reference_id)) {
      orderId = link.reference_id;
      break;
    }
  }

  if (!orderId) {
    for (const link of linked.rows) {
      if (link.reference_type === 'payment' && isUuid(link.reference_id)) {
        const payment = await executor.query<{ order_id: string }>(
          'SELECT order_id FROM payments WHERE id = $1 LIMIT 1',
          [link.reference_id],
        );
        orderId = payment.rows[0]?.order_id || null;
        if (orderId) break;
      }
      if (link.reference_type === 'refund' && isUuid(link.reference_id)) {
        const refund = await executor.query<{ order_id: string }>(
          'SELECT order_id FROM refunds WHERE id = $1 LIMIT 1',
          [link.reference_id],
        );
        orderId = refund.rows[0]?.order_id || null;
        if (orderId) break;
      }
    }
  }

  if (!orderId) return { orderId: null, orderStatus: null, paymentStatus: null };

  const order = await executor.query<{ status: string; payment_status: string | null }>(
    `SELECT o.status, p.status AS payment_status
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
      WHERE o.id = $1
      LIMIT 1`,
    [orderId],
  );
  return {
    orderId,
    orderStatus: order.rows[0]?.status || null,
    paymentStatus: order.rows[0]?.payment_status || null,
  };
};

const canAccessCase = (row: CaseRow, req: Request) =>
  isSupportStaffRole(actorRole(req)) || row.requester_id === actorId(req);

const restrictedLinkForActor = (link: CaseLinkRow, req: Request) => {
  if (!isRestrictedSupportReference(link.reference_type)) return true;
  return canViewRestrictedSupportData(actorRole(req));
};

const appendCaseEvent = async (
  client: PoolClient,
  input: {
    caseId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actorId?: string | null;
    actorRole?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
  },
) => {
  const metadata = input.metadata || {};
  await client.query(
    `INSERT INTO support_case_events
      (case_id, event_type, from_status, to_status, actor_id, actor_role, note, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.caseId,
      input.eventType,
      input.fromStatus || null,
      input.toStatus || null,
      input.actorId || null,
      input.actorRole || null,
      input.note ? redactSupportText(input.note).slice(0, 1000) : null,
      JSON.stringify(metadata),
    ],
  );

  await client.query(
    `INSERT INTO event_outbox
      (aggregate_type, aggregate_id, event_type, payload, headers)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'support_case',
      input.caseId,
      `support.case.${input.eventType}`,
      JSON.stringify({
        case_id: input.caseId,
        event_type: input.eventType,
        from_status: input.fromStatus || null,
        to_status: input.toStatus || null,
        actor_role: input.actorRole || null,
        metadata,
      }),
      JSON.stringify({ source: 'admin-service', pii_classification: 'restricted' }),
    ],
  );
};

const validateReferenceOwnership = async (
  client: PoolClient,
  links: Array<{ reference_type: string; reference_id: string }>,
  req: Request,
) => {
  if (actorRole(req) !== 'customer') return;
  const customerId = actorId(req);
  let knownReferenceCount = 0;
  let ownedReferenceCount = 0;

  for (const link of links) {
    if (!isUuid(link.reference_id)) continue;
    let result: { rows: Array<{ customer_id?: string; order_id?: string }> } | null = null;
    if (link.reference_type === 'order') {
      result = await client.query('SELECT customer_id FROM orders WHERE id = $1 LIMIT 1', [link.reference_id]);
    } else if (link.reference_type === 'payment') {
      result = await client.query(
        `SELECT o.customer_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1 LIMIT 1`,
        [link.reference_id],
      );
    } else if (link.reference_type === 'refund') {
      result = await client.query(
        `SELECT o.customer_id FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.id = $1 LIMIT 1`,
        [link.reference_id],
      );
    }

    if (result) {
      knownReferenceCount += 1;
      if (result.rows[0]?.customer_id === customerId) ownedReferenceCount += 1;
    }
  }

  if (knownReferenceCount > 0 && ownedReferenceCount === 0) {
    throw Object.assign(new Error('Reference support case bukan milik customer terautentikasi'), { statusCode: 403 });
  }
};

const validateReferenceIds = (links: Array<{ reference_type: string; reference_id: string }>) => {
  const seen = new Set<string>();
  for (const link of links) {
    const key = `${link.reference_type}:${link.reference_id}`;
    if (seen.has(key)) throw Object.assign(new Error('Reference support case duplikat'), { statusCode: 400 });
    seen.add(key);
  }
};

const caseDetail = async (row: CaseRow, req: Request, useWriter = false) => {
  const executor = useWriter ? db : readDb;
  const [linksResult, eventsResult, actionsResult, authority] = await Promise.all([
    executor.query<CaseLinkRow>(
      `SELECT id, reference_type, reference_id, reference_label, created_at
         FROM support_case_links
        WHERE case_id = $1
        ORDER BY created_at ASC`,
      [row.id],
    ),
    executor.query<CaseEventRow>(
      `SELECT id, event_type, from_status, to_status, actor_id, actor_role, note, metadata, created_at
         FROM support_case_events
        WHERE case_id = $1
        ORDER BY created_at ASC`,
      [row.id],
    ),
    executor.query<CaseActionRow>(
      `SELECT id, idempotency_key, action_type, status, requested_by, amount_idr,
              external_reference, result_metadata, error_code, created_at, updated_at
         FROM support_case_actions
        WHERE case_id = $1
        ORDER BY created_at ASC`,
      [row.id],
    ),
    findAuthorityContext(row.id, useWriter),
  ]);

  const policy: SupportCasePolicy = getSupportCasePolicy({
    serviceCode: row.service_code,
    marketCode: row.market_code,
    category: row.category,
    caseStatus: row.status as any,
    orderStatus: authority.orderStatus,
    paymentStatus: authority.paymentStatus,
    actorRole: actorRole(req),
  });

  return {
    ...row,
    sla_breached: new Date(row.sla_due_at).getTime() < Date.now() && !['resolved', 'closed'].includes(row.status),
    links: linksResult.rows.filter((link) => restrictedLinkForActor(link, req)),
    events: eventsResult.rows.map((event) => ({
      ...event,
      actor_id: isSupportStaffRole(actorRole(req)) ? event.actor_id : null,
    })),
    actions: actionsResult.rows.map((action) => ({
      ...action,
      idempotency_key: undefined,
      requested_by: isSupportStaffRole(actorRole(req)) ? action.requested_by : null,
    })),
    authoritative: {
      order_id: authority.orderId,
      order_status: authority.orderStatus,
      payment_status: authority.paymentStatus,
    },
    policy,
  };
};

const respondWithCase = async (res: Response, req: Request, row: CaseRow) => {
  res.json({ success: true, data: await caseDetail(row, req) });
};

export const createSupportCase = async (req: Request, res: Response): Promise<void> => {
  const parsed = createCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed);
    return;
  }
  const currentActorId = actorId(req);
  if (!currentActorId) {
    res.status(401).json({ success: false, code: 'ERR_UNAUTHORIZED', error: 'Authentication required' });
    return;
  }

  const client = await db.connect();
  try {
    validateReferenceIds(parsed.data.links);
    await client.query('BEGIN');
    await validateReferenceOwnership(client, parsed.data.links, req);

    const inserted = await client.query<CaseRow>(
      `INSERT INTO support_cases
        (requester_id, requester_role, category, subject, description, service_code, market_code, priority)
       VALUES ($1, $2, $3, $4, $5, $6, LOWER($7), $8)
       RETURNING id, case_number, requester_id, requester_role, category, subject, description,
                 service_code, market_code, priority, status, assigned_to, escalation_level,
                 sla_due_at, resolved_at, reopened_at, reopen_count, created_at, updated_at`,
      [
        currentActorId,
        actorRole(req),
        parsed.data.category,
        parsed.data.subject,
        redactSupportText(parsed.data.description),
        parsed.data.service_code,
        parsed.data.market_code,
        parsed.data.priority,
      ],
    );
    const row = inserted.rows[0];

    for (const link of parsed.data.links) {
      await client.query(
        `INSERT INTO support_case_links (case_id, reference_type, reference_id, reference_label)
         VALUES ($1, $2, $3, $4)`,
        [row.id, link.reference_type, link.reference_id, link.label ? redactSupportText(link.label) : null],
      );
    }

    await appendCaseEvent(client, {
      caseId: row.id,
      eventType: 'created',
      toStatus: row.status,
      actorId: currentActorId,
      actorRole: actorRole(req),
      note: 'Support case created',
      metadata: {
        reference_count: parsed.data.links.length,
        service_code: parsed.data.service_code,
        market_code: parsed.data.market_code,
      },
    });
    await client.query('COMMIT');
    await respondWithCase(res, req, row);
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    const status = Number(error?.statusCode) || 500;
    if (status < 500) {
      res.status(status).json({ success: false, code: 'ERR_SUPPORT_CASE_REFERENCE', error: parseError(error) });
      return;
    }
    securityLog.error('Support case creation failed:', error);
    res.status(500).json({ success: false, code: 'ERR_SUPPORT_CASE_CREATE', error: 'Support case unavailable' });
  } finally {
    client.release();
  }
};

export const listSupportCases = async (req: Request, res: Response): Promise<void> => {
  const currentActorId = actorId(req);
  if (!currentActorId) {
    res.status(401).json({ success: false, code: 'ERR_UNAUTHORIZED', error: 'Authentication required' });
    return;
  }

  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '25'), 10) || 25, 1), 100);
  const offset = Math.max(Number.parseInt(String(req.query.offset || '0'), 10) || 0, 0);
  const status = String(req.query.status || '').trim();
  const category = String(req.query.category || '').trim();
  const staff = isSupportStaffRole(actorRole(req));
  const where: string[] = ['1=1'];
  const params: unknown[] = [];

  if (!staff) {
    params.push(currentActorId);
    where.push(`sc.requester_id = $${params.length}`);
  }
  if (status && CASE_STATUS_SET.has(status)) {
    params.push(status);
    where.push(`sc.status = $${params.length}`);
  }
  if (category) {
    params.push(category.slice(0, 80));
    where.push(`sc.category = $${params.length}`);
  }

  const count = await readDb.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM support_cases sc WHERE ${where.join(' AND ')}`,
    params,
  );
  const dataParams = [...params, limit, offset];
  const rows = await readDb.query<CaseRow>(
    `SELECT sc.id, sc.case_number, sc.requester_id, sc.requester_role, sc.category, sc.subject,
            sc.description, sc.service_code, sc.market_code, sc.priority, sc.status, sc.assigned_to,
            assigned.full_name AS assigned_to_name, sc.escalation_level, sc.sla_due_at, sc.resolved_at,
            sc.reopened_at, sc.reopen_count, sc.created_at, sc.updated_at
       FROM support_cases sc
       LEFT JOIN users assigned ON assigned.id = sc.assigned_to
      WHERE ${where.join(' AND ')}
      ORDER BY CASE WHEN sc.status IN ('open', 'investigating', 'pending_internal') THEN 0 ELSE 1 END,
               sc.sla_due_at ASC, sc.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams,
  );

  res.json({
    success: true,
    data: rows.rows.map((row) => ({
      ...row,
      description: redactSupportText(row.description),
      sla_breached: new Date(row.sla_due_at).getTime() < Date.now() && !['resolved', 'closed'].includes(row.status),
    })),
    total: Number(count.rows[0]?.count || 0),
    limit,
    offset,
  });
};

export const getSupportCase = async (req: Request, res: Response): Promise<void> => {
  const id = parseCaseId(String(req.params.id || ''));
  if (!id) {
    res.status(400).json({ success: false, code: 'ERR_SUPPORT_CASE_ID', error: 'Invalid case id' });
    return;
  }
  const row = await findCase(id);
  if (!row) {
    res.status(404).json({ success: false, code: 'ERR_SUPPORT_CASE_NOT_FOUND', error: 'Support case not found' });
    return;
  }
  if (!canAccessCase(row, req)) {
    res.status(403).json({ success: false, code: 'ERR_SUPPORT_CASE_FORBIDDEN', error: 'Support case access denied' });
    return;
  }
  await respondWithCase(res, req, row);
};

const statusTransitions: Record<string, Set<string>> = {
  open: new Set(['open', 'investigating', 'pending_customer', 'pending_internal', 'resolved', 'closed']),
  investigating: new Set(['investigating', 'pending_customer', 'pending_internal', 'resolved', 'closed']),
  pending_customer: new Set(['pending_customer', 'investigating', 'pending_internal', 'resolved', 'closed']),
  pending_internal: new Set(['pending_internal', 'investigating', 'pending_customer', 'resolved', 'closed']),
  resolved: new Set(['resolved', 'open', 'closed']),
  closed: new Set(['closed', 'open']),
};

export const updateSupportCase = async (req: Request, res: Response): Promise<void> => {
  const id = parseCaseId(String(req.params.id || ''));
  const parsed = updateCaseSchema.safeParse(req.body);
  if (!id) {
    res.status(400).json({ success: false, code: 'ERR_SUPPORT_CASE_ID', error: 'Invalid case id' });
    return;
  }
  if (!parsed.success) {
    sendValidationError(res, parsed);
    return;
  }
  const currentActorId = actorId(req);
  if (!currentActorId) {
    res.status(401).json({ success: false, code: 'ERR_UNAUTHORIZED', error: 'Authentication required' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query<CaseRow>(
      `SELECT id, case_number, requester_id, requester_role, category, subject, description, service_code,
              market_code, priority, status, assigned_to, escalation_level, sla_due_at, resolved_at,
              reopened_at, reopen_count, created_at, updated_at
         FROM support_cases WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = locked.rows[0];
    if (!row) throw Object.assign(new Error('Support case not found'), { statusCode: 404 });
    if (!isSupportStaffRole(actorRole(req))) throw Object.assign(new Error('Support staff only'), { statusCode: 403 });

    const nextStatus = parsed.data.status || row.status;
    if (!statusTransitions[row.status]?.has(nextStatus)) {
      throw Object.assign(new Error(`Transisi status ${row.status} ke ${nextStatus} tidak diizinkan`), { statusCode: 409 });
    }

    if (parsed.data.assigned_to) {
      const assignee = await client.query(
        `SELECT id FROM users WHERE id = $1 AND role = ANY($2::text[]) AND deleted_at IS NULL LIMIT 1`,
        [parsed.data.assigned_to, SUPPORT_STAFF_ROLES],
      );
      if (assignee.rows.length === 0) throw Object.assign(new Error('Assignee bukan support staff aktif'), { statusCode: 400 });
    }

    let slaDueAt: Date | null = row.sla_due_at;
    if (parsed.data.sla_due_at !== undefined) {
      slaDueAt = parsed.data.sla_due_at ? new Date(parsed.data.sla_due_at) : null;
      if (slaDueAt && Number.isNaN(slaDueAt.getTime())) {
        throw Object.assign(new Error('sla_due_at harus berupa tanggal valid'), { statusCode: 400 });
      }
    }
    const nextEscalation = parsed.data.escalation_level ?? row.escalation_level;
    const reopened = (row.status === 'resolved' || row.status === 'closed') && nextStatus === 'open';
    const resolvedAt = nextStatus === 'resolved' || nextStatus === 'closed' ? new Date() : null;

    const updated = await client.query<CaseRow>(
      `UPDATE support_cases
          SET status = $2,
              priority = $3,
              assigned_to = $4,
              escalation_level = $5,
              sla_due_at = $6,
              resolved_at = $7,
              reopened_at = CASE WHEN $8 THEN NOW() ELSE reopened_at END,
              reopen_count = CASE WHEN $8 THEN reopen_count + 1 ELSE reopen_count END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, case_number, requester_id, requester_role, category, subject, description,
                  service_code, market_code, priority, status, assigned_to, escalation_level,
                  sla_due_at, resolved_at, reopened_at, reopen_count, created_at, updated_at`,
      [id, nextStatus, parsed.data.priority ?? row.priority, parsed.data.assigned_to === undefined ? row.assigned_to : parsed.data.assigned_to, nextEscalation, slaDueAt, resolvedAt, reopened],
    );
    await appendCaseEvent(client, {
      caseId: id,
      eventType: reopened ? 'reopened' : 'updated',
      fromStatus: row.status,
      toStatus: nextStatus,
      actorId: currentActorId,
      actorRole: actorRole(req),
      note: parsed.data.note || 'Support case updated',
      metadata: {
        changed_fields: Object.keys(parsed.data).filter((key) => key !== 'note'),
        escalation_level: nextEscalation,
      },
    });
    await client.query('COMMIT');
    await respondWithCase(res, req, updated.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    const status = Number(error?.statusCode) || 500;
    if (status < 500) {
      res.status(status).json({ success: false, code: 'ERR_SUPPORT_CASE_UPDATE', error: parseError(error) });
      return;
    }
    securityLog.error('Support case update failed:', error);
    res.status(500).json({ success: false, code: 'ERR_SUPPORT_CASE_UPDATE', error: 'Support case unavailable' });
  } finally {
    client.release();
  }
};

type FinancialResult = {
  success: boolean;
  amountIdr: number | null;
  externalReference: string | null;
  errorCode: string | null;
};

const executeFinancialAction = async (
  action: SupportAction,
  caseId: string,
  reason: string,
  authority: AuthorityContext,
  refundMode: 'full' | 'partial',
  refundItems: Array<{ item_id: string; qty: number }>,
  includeDeliveryFee: boolean,
  idempotencyKey: string,
): Promise<FinancialResult> => {
  if (!authority.orderId) return { success: false, amountIdr: null, externalReference: null, errorCode: 'ORDER_REFERENCE_REQUIRED' };
  if (refundMode === 'partial' && refundItems.length === 0) {
    return { success: false, amountIdr: null, externalReference: null, errorCode: 'REFUND_ITEMS_REQUIRED' };
  }

  const baseUrl = process.env.ORDER_SERVICE_URL || 'http://order-service:8083';
  const path = refundMode === 'partial' ? '/api/v1/internal/refunds/items' : '/api/v1/internal/refunds/process';
  const payload = refundMode === 'partial'
    ? {
        order_id: authority.orderId,
        items: refundItems.map((item) => ({
          menu_item_id: item.item_id,
          quantity: item.qty,
          reason: `${action} support case ${caseId}: ${reason}`,
        })),
        include_delivery_fee: includeDeliveryFee,
        reason,
      }
    : {
        order_id: authority.orderId,
        reason: `${action} support case ${caseId}: ${reason}`,
        original_status: authority.orderStatus || '',
      };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': process.env.INTERNAL_API_KEY || 'dev-internal-key-super-secret',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: abort.signal,
    });
    if (!response.ok) {
      securityLog.error('Support financial action upstream rejected', {
        case_id: caseId,
        action,
        status: response.status,
      });
      return { success: false, amountIdr: null, externalReference: null, errorCode: `ORDER_SERVICE_${response.status}` };
    }
    const body = await response.json().catch(() => null) as any;
    const data = body?.data || {};
    const amount = Number(data.amount_idr ?? data.AmountIDR ?? NaN);
    return {
      success: true,
      amountIdr: Number.isFinite(amount) ? amount : null,
      externalReference: typeof data.id === 'string' ? data.id : null,
      errorCode: null,
    };
  } catch (error: any) {
    securityLog.error('Support financial action upstream unavailable', {
      case_id: caseId,
      action,
      error: error?.name === 'AbortError' ? 'timeout' : error?.message,
    });
    return { success: false, amountIdr: null, externalReference: null, errorCode: error?.name === 'AbortError' ? 'ORDER_SERVICE_TIMEOUT' : 'ORDER_SERVICE_UNAVAILABLE' };
  } finally {
    clearTimeout(timer);
  }
};

export const executeSupportCaseAction = async (req: Request, res: Response): Promise<void> => {
  const id = parseCaseId(String(req.params.id || ''));
  const parsed = actionSchema.safeParse(req.body);
  const idempotencyKey = (readHeader(req.headers['x-idempotency-key']) || '').trim();
  if (!id) {
    res.status(400).json({ success: false, code: 'ERR_SUPPORT_CASE_ID', error: 'Invalid case id' });
    return;
  }
  if (!parsed.success) {
    sendValidationError(res, parsed);
    return;
  }
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    res.status(400).json({ success: false, code: 'ERR_IDEMPOTENCY_REQUIRED', error: 'X-Idempotency-Key wajib diisi' });
    return;
  }
  const currentActorId = actorId(req);
  if (!currentActorId || !isSupportStaffRole(actorRole(req))) {
    res.status(403).json({ success: false, code: 'ERR_SUPPORT_STAFF_REQUIRED', error: 'Support staff only' });
    return;
  }

  const client = await db.connect();
  let financial = false;
  let actionId = '';
  let authority: AuthorityContext = { orderId: null, orderStatus: null, paymentStatus: null };
  try {
    await client.query('BEGIN');
    const locked = await client.query<CaseRow>(
      `SELECT id, case_number, requester_id, requester_role, category, subject, description, service_code,
              market_code, priority, status, assigned_to, escalation_level, sla_due_at, resolved_at,
              reopened_at, reopen_count, created_at, updated_at
         FROM support_cases WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = locked.rows[0];
    if (!row) throw Object.assign(new Error('Support case not found'), { statusCode: 404 });

    const existing = await client.query<CaseActionRow>(
      `SELECT id, idempotency_key, action_type, status, requested_by, amount_idr,
              external_reference, result_metadata, error_code, created_at, updated_at
         FROM support_case_actions WHERE case_id = $1 AND idempotency_key = $2 LIMIT 1`,
      [id, idempotencyKey],
    );
    if (existing.rows[0]?.status === 'succeeded') {
      await client.query('ROLLBACK');
      res.json({ success: true, replayed: true, data: existing.rows[0] });
      return;
    }
    if (existing.rows[0]?.status === 'processing') {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, code: 'ERR_SUPPORT_ACTION_IN_PROGRESS', error: 'Action dengan idempotency key ini masih diproses' });
      return;
    }

    authority = await findAuthorityContext(id, true);
    const policy = getSupportCasePolicy({
      serviceCode: row.service_code,
      marketCode: row.market_code,
      category: row.category,
      caseStatus: row.status as any,
      orderStatus: authority.orderStatus,
      paymentStatus: authority.paymentStatus,
      actorRole: actorRole(req),
    });
    if (!policy.allowedActions.includes(parsed.data.action)) {
      throw Object.assign(new Error(`Action ${parsed.data.action} tidak diizinkan oleh policy ${policy.version}`), { statusCode: 409 });
    }

    financial = FINANCIAL_ACTIONS.has(parsed.data.action);
    if (financial) {
      if (!RESTRICTED_FINANCIAL_ROLES.has(actorRole(req)) || !req.user?.totp_verified) {
        throw Object.assign(new Error('Refund/compensation membutuhkan role finance dan TOTP'), { statusCode: 403 });
      }
    }

    const actionResult = existing.rows[0]
      ? await client.query<CaseActionRow>(
          `UPDATE support_case_actions
              SET status = 'processing', error_code = NULL, updated_at = NOW()
            WHERE id = $1
            RETURNING id, idempotency_key, action_type, status, requested_by, amount_idr,
                      external_reference, result_metadata, error_code, created_at, updated_at`,
          [existing.rows[0].id],
        )
      : await client.query<CaseActionRow>(
          `INSERT INTO support_case_actions
            (case_id, idempotency_key, action_type, status, requested_by, result_metadata)
           VALUES ($1, $2, $3, 'processing', $4, '{}'::jsonb)
           RETURNING id, idempotency_key, action_type, status, requested_by, amount_idr,
                     external_reference, result_metadata, error_code, created_at, updated_at`,
          [id, idempotencyKey, parsed.data.action, currentActorId],
        );
    actionId = actionResult.rows[0].id;

    if (financial) {
      await appendCaseEvent(client, {
        caseId: id,
        eventType: 'financial_action_requested',
        fromStatus: row.status,
        toStatus: row.status,
        actorId: currentActorId,
        actorRole: actorRole(req),
        note: parsed.data.reason,
        metadata: {
          action: parsed.data.action,
          refund_mode: parsed.data.refund_mode,
          action_id: actionId,
          idempotency_key_hash: idempotencyKey.slice(0, 8),
        },
      });
      await client.query('COMMIT');
    } else {
      const nextStatus = parsed.data.action === 'resolve'
        ? 'resolved'
        : parsed.data.action === 'reopen'
          ? 'open'
          : parsed.data.action === 'request_more_info'
            ? 'pending_customer'
            : parsed.data.action === 'escalate'
              ? 'pending_internal'
              : row.status;
      const nextAssignee = parsed.data.action === 'reassign' ? parsed.data.assigned_to : row.assigned_to;
      if (parsed.data.action === 'reassign' && !nextAssignee) {
        throw Object.assign(new Error('assigned_to wajib diisi untuk action reassign'), { statusCode: 400 });
      }
      if (nextAssignee) {
        const assignee = await client.query(
          `SELECT id FROM users WHERE id = $1 AND role = ANY($2::text[]) AND deleted_at IS NULL LIMIT 1`,
          [nextAssignee, SUPPORT_STAFF_ROLES],
        );
        if (assignee.rows.length === 0) throw Object.assign(new Error('Assignee bukan support staff aktif'), { statusCode: 400 });
      }
      await client.query(
        `UPDATE support_cases
            SET status = $2,
                assigned_to = $3,
                escalation_level = CASE WHEN $4 = 'escalate' THEN LEAST(escalation_level + 1, 5) ELSE escalation_level END,
                resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END,
                reopened_at = CASE WHEN $4 = 'reopen' THEN NOW() ELSE reopened_at END,
                reopen_count = CASE WHEN $4 = 'reopen' THEN reopen_count + 1 ELSE reopen_count END,
                updated_at = NOW()
          WHERE id = $1`,
        [id, nextStatus, nextAssignee || null, parsed.data.action],
      );
      await client.query(
        `UPDATE support_case_actions SET status = 'succeeded', result_metadata = $2, updated_at = NOW() WHERE id = $1`,
        [actionId, JSON.stringify({ next_status: nextStatus })],
      );
      await appendCaseEvent(client, {
        caseId: id,
        eventType: parsed.data.action,
        fromStatus: row.status,
        toStatus: nextStatus,
        actorId: currentActorId,
        actorRole: actorRole(req),
        note: parsed.data.reason,
        metadata: { action_id: actionId },
      });
      await client.query('COMMIT');
      const updated = await findCase(id);
      if (!updated) throw new Error('Support case disappeared after action');
      await respondWithCase(res, req, updated);
      return;
    }
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    const status = Number(error?.statusCode) || 500;
    if (status < 500) {
      res.status(status).json({ success: false, code: 'ERR_SUPPORT_CASE_ACTION', error: parseError(error) });
      return;
    }
    securityLog.error('Support case action preparation failed:', error);
    res.status(500).json({ success: false, code: 'ERR_SUPPORT_CASE_ACTION', error: 'Support action unavailable' });
    return;
  } finally {
    client.release();
  }

  const financialResult = await executeFinancialAction(
    parsed.data.action,
    id,
    parsed.data.reason,
    authority,
    parsed.data.refund_mode,
    parsed.data.refund_items,
    parsed.data.include_delivery_fee,
    idempotencyKey,
  );

  const resultClient = await db.connect();
  try {
    await resultClient.query('BEGIN');
    await resultClient.query(
      `UPDATE support_case_actions
          SET status = $2,
              amount_idr = $3,
              external_reference = $4,
              error_code = $5,
              result_metadata = $6,
              updated_at = NOW()
        WHERE id = $1`,
      [
        actionId,
        financialResult.success ? 'succeeded' : 'failed',
        financialResult.amountIdr,
        financialResult.externalReference,
        financialResult.errorCode,
        JSON.stringify({
          refund_mode: parsed.data.refund_mode,
          order_id: authority.orderId,
          action: parsed.data.action,
        }),
      ],
    );
    await appendCaseEvent(resultClient, {
      caseId: id,
      eventType: financialResult.success ? 'financial_action_succeeded' : 'financial_action_failed',
      actorId: currentActorId,
      actorRole: actorRole(req),
      note: financialResult.success ? 'Financial API accepted action' : 'Financial API rejected action',
      metadata: {
        action: parsed.data.action,
        action_id: actionId,
        amount_idr: financialResult.amountIdr,
        error_code: financialResult.errorCode,
      },
    });
    await resultClient.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        currentActorId,
        'support.case.financial_action',
        id,
        JSON.stringify({
          action: parsed.data.action,
          action_id: actionId,
          status: financialResult.success ? 'succeeded' : 'failed',
          amount_idr: financialResult.amountIdr,
          error_code: financialResult.errorCode,
        }),
      ],
    );
    await resultClient.query('COMMIT');
  } catch (error) {
    await resultClient.query('ROLLBACK').catch(() => undefined);
    securityLog.error('Support case financial result recording failed:', error);
    res.status(500).json({ success: false, code: 'ERR_SUPPORT_CASE_FINANCIAL_RECORD', error: 'Financial action result could not be recorded' });
    return;
  } finally {
    resultClient.release();
  }

  if (!financialResult.success) {
    res.status(502).json({
      success: false,
      code: 'ERR_SUPPORT_FINANCIAL_UPSTREAM',
      error: 'Financial API did not accept the action',
      action_id: actionId,
      retryable: false,
    });
    return;
  }

  const updated = await findCase(id);
  if (!updated) {
    res.status(500).json({ success: false, code: 'ERR_SUPPORT_CASE_NOT_FOUND_AFTER_ACTION', error: 'Support case unavailable' });
    return;
  }
  res.json({
    success: true,
    data: await caseDetail(updated, req),
    financial_action: {
      action_id: actionId,
      amount_idr: financialResult.amountIdr,
      external_reference: financialResult.externalReference,
    },
  });
};
