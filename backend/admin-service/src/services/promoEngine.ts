import { PoolClient } from 'pg';
import { z } from 'zod';
import { db, readDb } from '../db';
import { createNotification } from '../notifications';
import { securityLog } from '../security/logRedaction';

export type PromoActor = {
  id?: string;
  role?: string;
  full_name?: string;
};

export type PromoValidationInput = {
  code?: string;
  campaign_id?: string;
  service_code: string;
  vehicle_type?: string;
  zone_code?: string;
  gross_amount_idr: number;
  insurance_amount_idr?: number;
  payment_fee_idr?: number;
  tax_amount_idr?: number;
  idempotency_key?: string;
  order_id?: string;
};

type PromoCampaignStatus = 'draft' | 'pending_approval' | 'scheduled' | 'active' | 'paused' | 'expired' | 'archived';
type PromoDiscountType = 'fixed' | 'percentage' | 'shipping_discount' | 'free_insurance';

const serviceCodeSchema = z.string().trim().min(2).max(50).regex(/^[a-z0-9_-]+$/i);
const campaignStatusSchema = z.enum(['draft', 'pending_approval', 'scheduled', 'active', 'paused', 'expired', 'archived']);
const discountTypeSchema = z.enum(['fixed', 'percentage', 'shipping_discount', 'free_insurance']);
const componentScopeSchema = z.enum(['shipping', 'insurance', 'service_fee', 'referral']);
const uuidSchema = z.string().uuid();

const campaignMutationSchema = z.object({
  code: z.string().trim().min(3).max(40).regex(/^[A-Z0-9_-]+$/).optional(),
  name: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  discount_type: discountTypeSchema.optional(),
  discount_value_idr: z.coerce.number().int().min(0).max(100_000_000).optional(),
  discount_percent: z.coerce.number().min(0).max(100).optional(),
  max_discount_idr: z.coerce.number().int().min(0).max(100_000_000).optional(),
  min_order_idr: z.coerce.number().int().min(0).max(100_000_000).optional(),
  service_codes: z.array(serviceCodeSchema).min(1).max(20).optional(),
  component_scope: componentScopeSchema.optional(),
  stacking_key: z.string().trim().min(2).max(80).regex(/^[a-z0-9_.:-]+$/i).optional(),
  allow_stack_different_service: z.boolean().optional(),
  total_budget_idr: z.coerce.number().int().min(0).max(10_000_000_000).optional(),
  daily_budget_idr: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  max_redemptions: z.coerce.number().int().min(0).max(10_000_000).optional(),
  per_user_limit: z.coerce.number().int().min(1).max(100).optional(),
  starts_at: z.coerce.date().optional(),
  ends_at: z.coerce.date().optional(),
  audience_rules: z.record(z.string(), z.unknown()).optional(),
  eligibility_rules: z.record(z.string(), z.unknown()).optional(),
  notification_copy: z.record(z.string(), z.unknown()).optional(),
  risk_campaign: z.boolean().optional(),
  risk_reason: z.string().trim().max(500).optional(),
});

const validationSchema = z.object({
  code: z.string().trim().max(40).optional(),
  campaign_id: z.string().uuid().optional(),
  service_code: serviceCodeSchema,
  vehicle_type: z.string().trim().max(40).optional(),
  zone_code: z.string().trim().max(80).optional(),
  gross_amount_idr: z.coerce.number().int().min(0).max(1_000_000_000),
  insurance_amount_idr: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  payment_fee_idr: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  tax_amount_idr: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  idempotency_key: z.string().trim().min(8).max(120).optional(),
  order_id: z.string().uuid().optional(),
}).refine((value) => Boolean(value.code || value.campaign_id), {
  message: 'code or campaign_id is required',
});

const promoNotificationSchema = z.object({
  channel: z.enum(['none', 'in_app', 'push_in_app', 'scheduled_push']).default('in_app'),
  scheduled_at: z.coerce.date().optional(),
  max_per_day: z.coerce.number().int().min(0).max(10).default(1),
  max_per_week: z.coerce.number().int().min(0).max(30).default(3),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).default('21:00'),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
  title: z.string().trim().min(3).max(80).optional(),
  body: z.string().trim().min(3).max(160).optional(),
});

const integerValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const decimalValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const jsonValue = (value: unknown) => JSON.stringify(value ?? {});

const assertActor = (actor: PromoActor) => {
  if (!actor?.id) {
    const error = new Error('Authenticated actor is required');
    (error as any).statusCode = 401;
    throw error;
  }
};

const assertSuperAdmin = (actor: PromoActor) => {
  if (actor.role !== 'super_admin') {
    const error = new Error('Only superadmin can approve risk campaigns');
    (error as any).statusCode = 403;
    throw error;
  }
};

const auditPromoEvent = async (
  client: Pick<PoolClient, 'query'>,
  campaignId: string | null,
  actor: PromoActor,
  action: string,
  reason: string,
  metadata: Record<string, unknown> = {},
) => {
  await client.query(
    `INSERT INTO promo_audit_events (campaign_id, actor_id, actor_role, action, reason, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [campaignId, actor.id || null, actor.role || null, action, reason, jsonValue(metadata)]
  );
};

const campaignSelect = `
  SELECT
    id,
    code,
    name,
    description,
    status,
    discount_type,
    discount_value_idr,
    discount_percent,
    max_discount_idr,
    min_order_idr,
    service_codes,
    component_scope,
    stacking_key,
    allow_stack_different_service,
    total_budget_idr,
    daily_budget_idr,
    reserved_budget_idr,
    redeemed_budget_idr,
    max_redemptions,
    per_user_limit,
    starts_at,
    ends_at,
    audience_rules,
    eligibility_rules,
    notification_copy,
    risk_campaign,
    risk_reason,
    approved_by,
    approved_at,
    published_by,
    published_at,
    paused_by,
    paused_at,
    created_by,
    updated_by,
    created_at,
    updated_at
  FROM promo_campaigns
`;

export const listPromoCampaigns = async (query: { status?: string; service_code?: string; limit?: unknown }) => {
  const status = campaignStatusSchema.safeParse(query.status).success ? query.status as PromoCampaignStatus : null;
  const serviceCode = serviceCodeSchema.safeParse(query.service_code).success ? String(query.service_code) : null;
  const parsedLimit = Number.parseInt(String(query.limit || 50), 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;

  const result = await readDb.query(
    `${campaignSelect}
     WHERE ($1::TEXT IS NULL OR status = $1)
       AND ($2::TEXT IS NULL OR $2 = ANY(service_codes))
     ORDER BY created_at DESC
     LIMIT $3`,
    [status, serviceCode, limit]
  );
  return result.rows;
};

export const getPromoCampaignById = async (id: string) => {
  uuidSchema.parse(id);
  const result = await readDb.query(`${campaignSelect} WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] || null;
};

export const getPromoMarginPolicies = async () => {
  const result = await readDb.query(
    `SELECT id, service_code, vehicle_type, zone_code, min_margin_amount_idr, min_margin_percent, active, created_at, updated_at
     FROM promo_margin_policies
     ORDER BY service_code ASC, vehicle_type ASC NULLS FIRST, zone_code ASC NULLS FIRST`
  );
  return result.rows;
};

const assertCampaignEconomics = (campaign: Record<string, any>) => {
  const startsAt = new Date(campaign.starts_at);
  const endsAt = new Date(campaign.ends_at);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) {
    const error = new Error('Campaign schedule is invalid');
    (error as any).statusCode = 400;
    throw error;
  }

  if (integerValue(campaign.total_budget_idr) <= 0) {
    const error = new Error('Campaign total budget must be configured before activation');
    (error as any).statusCode = 400;
    throw error;
  }

  if (!Array.isArray(campaign.service_codes) || campaign.service_codes.length === 0) {
    const error = new Error('Campaign must target at least one delivery service');
    (error as any).statusCode = 400;
    throw error;
  }
};

const requirePoliciesForCampaign = async (campaign: Record<string, any>) => {
  const serviceCodes = Array.isArray(campaign.service_codes) ? campaign.service_codes : [];
  const result = await readDb.query(
    `SELECT service_code
     FROM promo_margin_policies
     WHERE active = TRUE AND service_code = ANY($1::TEXT[])`,
    [serviceCodes]
  );
  const configured = new Set(result.rows.map((row) => row.service_code));
  const missing = serviceCodes.filter((serviceCode) => !configured.has(serviceCode));

  if (missing.length > 0) {
    const error = new Error(`Margin policy missing for service: ${missing.join(', ')}`);
    (error as any).statusCode = 409;
    throw error;
  }
};

export const createPromoCampaign = async (actor: PromoActor, input: unknown) => {
  assertActor(actor);
  const parsed = campaignMutationSchema.extend({
    code: campaignMutationSchema.shape.code.unwrap(),
    name: campaignMutationSchema.shape.name.unwrap(),
    discount_type: discountTypeSchema.default('fixed'),
    service_codes: z.array(serviceCodeSchema).min(1).max(20),
    starts_at: z.coerce.date(),
    ends_at: z.coerce.date(),
  }).parse(input);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO promo_campaigns (
        code,
        name,
        description,
        status,
        discount_type,
        discount_value_idr,
        discount_percent,
        max_discount_idr,
        min_order_idr,
        service_codes,
        component_scope,
        stacking_key,
        allow_stack_different_service,
        total_budget_idr,
        daily_budget_idr,
        max_redemptions,
        per_user_limit,
        starts_at,
        ends_at,
        audience_rules,
        eligibility_rules,
        notification_copy,
        risk_campaign,
        risk_reason,
        created_by,
        updated_by
      )
      VALUES (
        $1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9::TEXT[], $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19::jsonb, $20::jsonb, $21::jsonb, $22, $23, $24, $24
      )
      RETURNING *`,
      [
        parsed.code,
        parsed.name,
        parsed.description || '',
        parsed.discount_type,
        parsed.discount_value_idr || 0,
        parsed.discount_percent || 0,
        parsed.max_discount_idr || 0,
        parsed.min_order_idr || 0,
        parsed.service_codes,
        parsed.component_scope || 'shipping',
        parsed.stacking_key || parsed.service_codes[0],
        parsed.allow_stack_different_service !== false,
        parsed.total_budget_idr || 0,
        parsed.daily_budget_idr || 0,
        parsed.max_redemptions || 0,
        parsed.per_user_limit || 1,
        parsed.starts_at,
        parsed.ends_at,
        jsonValue(parsed.audience_rules || {}),
        jsonValue(parsed.eligibility_rules || {}),
        jsonValue(parsed.notification_copy || {}),
        parsed.risk_campaign === true,
        parsed.risk_reason || null,
        actor.id,
      ]
    );

    await auditPromoEvent(client, result.rows[0].id, actor, 'promo_campaign_created', 'Promo campaign draft created', {
      code: parsed.code,
      service_codes: parsed.service_codes,
    });
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updatePromoCampaign = async (actor: PromoActor, id: string, input: unknown) => {
  assertActor(actor);
  uuidSchema.parse(id);
  const parsed = campaignMutationSchema.parse(input);
  const existing = await getPromoCampaignById(id);
  if (!existing) {
    const error = new Error('Promo campaign not found');
    (error as any).statusCode = 404;
    throw error;
  }
  if (!['draft', 'pending_approval', 'paused', 'scheduled'].includes(existing.status)) {
    const error = new Error('Only draft, pending, scheduled, or paused campaigns can be edited');
    (error as any).statusCode = 409;
    throw error;
  }

  const merged = {
    ...existing,
    ...parsed,
    service_codes: parsed.service_codes || existing.service_codes,
    audience_rules: parsed.audience_rules || existing.audience_rules,
    eligibility_rules: parsed.eligibility_rules || existing.eligibility_rules,
    notification_copy: parsed.notification_copy || existing.notification_copy,
  };

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE promo_campaigns
       SET name = $2,
           description = $3,
           discount_type = $4,
           discount_value_idr = $5,
           discount_percent = $6,
           max_discount_idr = $7,
           min_order_idr = $8,
           service_codes = $9::TEXT[],
           component_scope = $10,
           stacking_key = $11,
           allow_stack_different_service = $12,
           total_budget_idr = $13,
           daily_budget_idr = $14,
           max_redemptions = $15,
           per_user_limit = $16,
           starts_at = $17,
           ends_at = $18,
           audience_rules = $19::jsonb,
           eligibility_rules = $20::jsonb,
           notification_copy = $21::jsonb,
           risk_campaign = $22,
           risk_reason = $23,
           updated_by = $24,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        merged.name,
        merged.description || '',
        merged.discount_type,
        integerValue(merged.discount_value_idr),
        decimalValue(merged.discount_percent),
        integerValue(merged.max_discount_idr),
        integerValue(merged.min_order_idr),
        Array.isArray(merged.service_codes) ? merged.service_codes : [],
        merged.component_scope || 'shipping',
        merged.stacking_key || (Array.isArray(merged.service_codes) ? merged.service_codes[0] : 'default'),
        merged.allow_stack_different_service !== false,
        integerValue(merged.total_budget_idr),
        integerValue(merged.daily_budget_idr),
        integerValue(merged.max_redemptions),
        integerValue(merged.per_user_limit, 1),
        merged.starts_at,
        merged.ends_at,
        jsonValue(merged.audience_rules || {}),
        jsonValue(merged.eligibility_rules || {}),
        jsonValue(merged.notification_copy || {}),
        merged.risk_campaign === true,
        merged.risk_reason || null,
        actor.id,
      ]
    );

    await auditPromoEvent(client, id, actor, 'promo_campaign_updated', 'Promo campaign updated', {
      code: existing.code,
    });
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const submitPromoCampaignForApproval = async (actor: PromoActor, id: string) => {
  assertActor(actor);
  uuidSchema.parse(id);
  const campaign = await getPromoCampaignById(id);
  if (!campaign) {
    const error = new Error('Promo campaign not found');
    (error as any).statusCode = 404;
    throw error;
  }
  assertCampaignEconomics(campaign);
  await requirePoliciesForCampaign(campaign);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const status: PromoCampaignStatus = campaign.risk_campaign ? 'pending_approval' : 'scheduled';
    const result = await client.query(
      `UPDATE promo_campaigns
       SET status = $2, updated_by = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, actor.id]
    );
    await auditPromoEvent(client, id, actor, 'promo_campaign_submitted', 'Promo campaign submitted for activation', {
      status,
    });
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const approvePromoCampaign = async (actor: PromoActor, id: string) => {
  assertActor(actor);
  assertSuperAdmin(actor);
  uuidSchema.parse(id);
  const campaign = await getPromoCampaignById(id);
  if (!campaign) {
    const error = new Error('Promo campaign not found');
    (error as any).statusCode = 404;
    throw error;
  }
  assertCampaignEconomics(campaign);
  await requirePoliciesForCampaign(campaign);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE promo_campaigns
       SET status = 'scheduled',
           approved_by = $2,
           approved_at = NOW(),
           updated_by = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, actor.id]
    );
    await auditPromoEvent(client, id, actor, 'promo_campaign_approved', 'Risk campaign approved by superadmin');
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const publishPromoCampaign = async (actor: PromoActor, id: string) => {
  assertActor(actor);
  uuidSchema.parse(id);
  const campaign = await getPromoCampaignById(id);
  if (!campaign) {
    const error = new Error('Promo campaign not found');
    (error as any).statusCode = 404;
    throw error;
  }
  assertCampaignEconomics(campaign);
  await requirePoliciesForCampaign(campaign);
  if (campaign.risk_campaign && !campaign.approved_at) {
    const error = new Error('Risk campaign requires superadmin approval before publish');
    (error as any).statusCode = 403;
    throw error;
  }

  const now = Date.now();
  const endsAt = new Date(campaign.ends_at).getTime();
  const startsAt = new Date(campaign.starts_at).getTime();
  const status: PromoCampaignStatus = startsAt <= now && endsAt > now ? 'active' : 'scheduled';

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE promo_campaigns
       SET status = $2,
           published_by = $3,
           published_at = NOW(),
           updated_by = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, actor.id]
    );
    await auditPromoEvent(client, id, actor, 'promo_campaign_published', 'Promo campaign published', { status });
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const pausePromoCampaign = async (actor: PromoActor, id: string, reason: string) => {
  assertActor(actor);
  uuidSchema.parse(id);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE promo_campaigns
       SET status = 'paused',
           paused_by = $2,
           paused_at = NOW(),
           updated_by = $2,
           updated_at = NOW()
       WHERE id = $1
         AND status IN ('active', 'scheduled', 'pending_approval')
       RETURNING *`,
      [id, actor.id]
    );

    if (result.rowCount === 0) {
      const error = new Error('Promo campaign not found or cannot be paused');
      (error as any).statusCode = 404;
      throw error;
    }

    await auditPromoEvent(client, id, actor, 'promo_campaign_paused', reason || 'Promo campaign paused');
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const findCampaignForValidation = async (input: z.infer<typeof validationSchema>) => {
  const result = await readDb.query(
    `${campaignSelect}
     WHERE status = 'active'
       AND starts_at <= NOW()
       AND ends_at > NOW()
       AND (total_budget_idr = 0 OR (reserved_budget_idr + redeemed_budget_idr) < total_budget_idr)
       AND ($1::UUID IS NULL OR id = $1)
       AND ($2::TEXT IS NULL OR code = UPPER($2))
       AND $3 = ANY(service_codes)
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.campaign_id || null, input.code || null, input.service_code]
  );
  return result.rows[0] || null;
};

const fetchServiceAndPolicy = async (input: z.infer<typeof validationSchema>) => {
  const result = await readDb.query(
    `SELECT
       dsp.code,
       dsp.platform_commission_percent,
       dsp.courier_payout_percent,
       dsp.courier_min_payout_idr,
       dsp.mdr_percent,
       dsp.ppn_percent,
       pmp.min_margin_amount_idr,
       pmp.min_margin_percent
     FROM delivery_service_products dsp
     JOIN promo_margin_policies pmp
       ON pmp.service_code = dsp.code
      AND pmp.active = TRUE
      AND (pmp.vehicle_type IS NULL OR pmp.vehicle_type = $2)
      AND (pmp.zone_code IS NULL OR pmp.zone_code = $3)
     WHERE dsp.code = $1
     ORDER BY
       CASE WHEN pmp.vehicle_type IS NULL THEN 1 ELSE 0 END,
       CASE WHEN pmp.zone_code IS NULL THEN 1 ELSE 0 END
     LIMIT 1`,
    [input.service_code, input.vehicle_type || null, input.zone_code || null]
  );
  return result.rows[0] || null;
};

const calculateDiscount = (campaign: Record<string, any>, input: z.infer<typeof validationSchema>) => {
  const gross = input.gross_amount_idr;
  const maxDiscount = integerValue(campaign.max_discount_idr);
  let discount = 0;

  switch (campaign.discount_type as PromoDiscountType) {
    case 'percentage':
      discount = Math.ceil(gross * (decimalValue(campaign.discount_percent) / 100));
      break;
    case 'free_insurance':
      discount = input.insurance_amount_idr || 0;
      break;
    case 'fixed':
    case 'shipping_discount':
    default:
      discount = integerValue(campaign.discount_value_idr);
      break;
  }

  if (maxDiscount > 0) {
    discount = Math.min(discount, maxDiscount);
  }
  return Math.max(0, Math.min(discount, gross));
};

export const validatePromoForCheckout = async (
  userId: string,
  rawInput: PromoValidationInput,
  mode: 'quote' | 'reserve' | 'redeem' = 'quote',
) => {
  const input = validationSchema.parse(rawInput);
  const campaign = await findCampaignForValidation(input);
  if (!campaign) {
    return {
      eligible: false,
      reason: 'Promo tidak tersedia untuk layanan ini.',
      campaign: null,
      discount_idr: 0,
    };
  }

  if (input.gross_amount_idr < integerValue(campaign.min_order_idr)) {
    return {
      eligible: false,
      reason: 'Nilai order belum memenuhi minimum promo.',
      campaign,
      discount_idr: 0,
    };
  }

  const serviceAndPolicy = await fetchServiceAndPolicy(input);
  if (!serviceAndPolicy) {
    return {
      eligible: false,
      reason: 'Promo belum siap untuk layanan ini.',
      campaign,
      discount_idr: 0,
    };
  }

  const redemptionCount = await readDb.query(
    `SELECT COUNT(*)::INT AS count
     FROM promo_redemptions
     WHERE campaign_id = $1
       AND user_id = $2
       AND status IN ('reserved', 'redeemed')
       AND ($3::TEXT IS NULL OR idempotency_key <> $3)`,
    [campaign.id, userId, input.idempotency_key || null]
  );
  if (integerValue(redemptionCount.rows[0]?.count) >= integerValue(campaign.per_user_limit, 1)) {
    return {
      eligible: false,
      reason: 'Batas penggunaan promo sudah tercapai.',
      campaign,
      discount_idr: 0,
    };
  }

  const discount = calculateDiscount(campaign, input);
  const gross = input.gross_amount_idr;
  const idempotentReplay = mode !== 'quote' && input.idempotency_key
    ? await readDb.query(
      `SELECT id, status
       FROM promo_redemptions
       WHERE campaign_id = $1
         AND user_id = $2
         AND idempotency_key = $3
         AND status IN ('reserved', 'redeemed')
       LIMIT 1`,
      [campaign.id, userId, input.idempotency_key]
    )
    : null;
  const paymentFee = input.payment_fee_idr ?? Math.ceil(gross * (decimalValue(serviceAndPolicy.mdr_percent) / 100));
  const tax = input.tax_amount_idr ?? Math.ceil(gross * (decimalValue(serviceAndPolicy.ppn_percent) / 100));
  const operationalPool = Math.max(0, gross - paymentFee - tax - (input.insurance_amount_idr || 0));
  const courierPayout = Math.max(
    integerValue(serviceAndPolicy.courier_min_payout_idr),
    Math.ceil(operationalPool * (decimalValue(serviceAndPolicy.courier_payout_percent) / 100))
  );
  const contributionMarginIdr = Math.max(0, gross - paymentFee - tax - (input.insurance_amount_idr || 0) - courierPayout - discount);
  const contributionMarginPercent = gross > 0 ? (contributionMarginIdr / gross) * 100 : 0;
  const minMarginAmount = integerValue(serviceAndPolicy.min_margin_amount_idr);
  const minMarginPercent = decimalValue(serviceAndPolicy.min_margin_percent);

  if (contributionMarginIdr < minMarginAmount || contributionMarginPercent < minMarginPercent) {
    return {
      eligible: false,
      reason: 'Promo tidak memenuhi batas margin layanan.',
      campaign,
      discount_idr: 0,
      economics: {
        contribution_margin_idr: contributionMarginIdr,
        contribution_margin_percent: Number(contributionMarginPercent.toFixed(2)),
        min_margin_amount_idr: minMarginAmount,
        min_margin_percent: minMarginPercent,
      },
    };
  }

  if (integerValue(campaign.total_budget_idr) > 0 && !idempotentReplay?.rows.length) {
    const available = integerValue(campaign.total_budget_idr) - integerValue(campaign.reserved_budget_idr) - integerValue(campaign.redeemed_budget_idr);
    if (available < discount) {
      return {
        eligible: false,
        reason: 'Kuota promo sudah habis.',
        campaign,
        discount_idr: 0,
      };
    }
  }

  const result = {
    eligible: true,
    reason: null,
    campaign,
    discount_idr: discount,
    mode,
    economics: {
      gross_amount_idr: gross,
      discount_idr: discount,
      payment_fee_idr: paymentFee,
      tax_amount_idr: tax,
      insurance_amount_idr: input.insurance_amount_idr || 0,
      courier_payout_idr: courierPayout,
      contribution_margin_idr: contributionMarginIdr,
      contribution_margin_percent: Number(contributionMarginPercent.toFixed(2)),
      min_margin_amount_idr: minMarginAmount,
      min_margin_percent: minMarginPercent,
    },
  };

  if (mode === 'quote') {
    return result;
  }

  if (!input.idempotency_key) {
    const error = new Error('idempotency_key is required for promo reservation or redemption');
    (error as any).statusCode = 400;
    throw error;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const campaignLock = await client.query(
      `SELECT id, total_budget_idr, reserved_budget_idr, redeemed_budget_idr
       FROM promo_campaigns
       WHERE id = $1
       FOR UPDATE`,
      [campaign.id]
    );
    const lockedCampaign = campaignLock.rows[0];
    const ledgerType = mode === 'redeem' ? 'redeem' : 'reserve';
    const existingLedger = await client.query(
      `SELECT id, status
       FROM promo_budget_ledger
       WHERE campaign_id = $1
         AND idempotency_key = $2
         AND ledger_type = $3
       LIMIT 1
       FOR UPDATE`,
      [campaign.id, input.idempotency_key, ledgerType]
    );
    const available = integerValue(lockedCampaign.total_budget_idr) - integerValue(lockedCampaign.reserved_budget_idr) - integerValue(lockedCampaign.redeemed_budget_idr);
    if (integerValue(lockedCampaign.total_budget_idr) > 0 && existingLedger.rows.length === 0 && available < discount) {
      const error = new Error('Promo budget is no longer available');
      (error as any).statusCode = 409;
      throw error;
    }

    const ledgerInsert = await client.query(
      `INSERT INTO promo_budget_ledger (
        campaign_id,
        user_id,
        order_id,
        ledger_type,
        amount_idr,
        idempotency_key,
        status,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (campaign_id, idempotency_key, ledger_type) DO NOTHING
      RETURNING id`,
      [
        campaign.id,
        userId,
        input.order_id || null,
        ledgerType,
        discount,
        input.idempotency_key,
        mode === 'redeem' ? 'redeemed' : 'active',
        jsonValue(result.economics),
      ]
    );

    if (mode === 'redeem') {
      if ((ledgerInsert.rowCount || 0) > 0) {
        await client.query(
        `UPDATE promo_campaigns
         SET redeemed_budget_idr = redeemed_budget_idr + $2,
             updated_at = NOW()
         WHERE id = $1`,
          [campaign.id, discount]
        );
      }
      await client.query(
        `INSERT INTO promo_redemptions (
          campaign_id,
          user_id,
          order_id,
          idempotency_key,
          service_code,
          discount_idr,
          gross_order_revenue_idr,
          contribution_margin_idr,
          status,
          redeemed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'redeemed', NOW())
        ON CONFLICT (campaign_id, idempotency_key) DO UPDATE SET
          status = 'redeemed',
          order_id = COALESCE(EXCLUDED.order_id, promo_redemptions.order_id),
          redeemed_at = NOW()`,
        [
          campaign.id,
          userId,
          input.order_id || null,
          input.idempotency_key,
          input.service_code,
          discount,
          gross,
          contributionMarginIdr,
        ]
      );
    } else {
      if ((ledgerInsert.rowCount || 0) > 0) {
        await client.query(
        `UPDATE promo_campaigns
         SET reserved_budget_idr = reserved_budget_idr + $2,
             updated_at = NOW()
         WHERE id = $1`,
          [campaign.id, discount]
        );
      }
      await client.query(
        `INSERT INTO promo_redemptions (
          campaign_id,
          user_id,
          order_id,
          idempotency_key,
          service_code,
          discount_idr,
          gross_order_revenue_idr,
          contribution_margin_idr,
          status,
          reserved_until
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reserved', NOW() + INTERVAL '15 minutes')
        ON CONFLICT (campaign_id, idempotency_key) DO NOTHING`,
        [
          campaign.id,
          userId,
          input.order_id || null,
          input.idempotency_key,
          input.service_code,
          discount,
          gross,
          contributionMarginIdr,
        ]
      );
    }

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const releasePromoReservation = async (userId: string, idempotencyKey: string) => {
  if (!idempotencyKey || idempotencyKey.length < 8) {
    const error = new Error('idempotency_key is required');
    (error as any).statusCode = 400;
    throw error;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const reservation = await client.query(
      `SELECT id, campaign_id, amount_idr
       FROM promo_budget_ledger
       WHERE user_id = $1
         AND idempotency_key = $2
         AND ledger_type = 'reserve'
         AND status = 'active'
       FOR UPDATE`,
      [userId, idempotencyKey]
    );

    if (reservation.rows.length === 0) {
      await client.query('COMMIT');
      return { released: false, amount_idr: 0 };
    }

    const row = reservation.rows[0];
    await client.query(
      `UPDATE promo_budget_ledger
       SET status = 'released', released_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
    await client.query(
      `UPDATE promo_campaigns
       SET reserved_budget_idr = GREATEST(0, reserved_budget_idr - $2),
           updated_at = NOW()
       WHERE id = $1`,
      [row.campaign_id, row.amount_idr]
    );
    await client.query(
      `UPDATE promo_redemptions
       SET status = 'released'
       WHERE campaign_id = $1 AND user_id = $2 AND idempotency_key = $3 AND status = 'reserved'`,
      [row.campaign_id, userId, idempotencyKey]
    );

    await client.query('COMMIT');
    return { released: true, amount_idr: integerValue(row.amount_idr) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const promoDeepLink = (campaign: Record<string, any>) => {
  const code = String(campaign.code || '').trim();
  const encodedCode = encodeURIComponent(code);
  return `tembus://booking?promo=${encodedCode}`;
};

const isWithinQuietHours = (start: string, end: string, now = new Date()) => {
  const [startHour, startMinute] = start.split(':').map((part) => Number.parseInt(part, 10));
  const [endHour, endMinute] = end.split(':').map((part) => Number.parseInt(part, 10));
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
};

const fetchPromoAudience = async (
  campaignId: string,
  options: { limit?: number; maxPerDay?: number; maxPerWeek?: number; countOnly?: boolean } = {},
) => {
  const limit = Math.min(Math.max(integerValue(options.limit, 500), 1), 5000);
  const maxPerDay = Math.max(0, integerValue(options.maxPerDay, 1));
  const maxPerWeek = Math.max(0, integerValue(options.maxPerWeek, 3));
  if (maxPerDay === 0 || maxPerWeek === 0) {
    return { count: 0, users: [] as Array<{ id: string }> };
  }
  const selectClause = options.countOnly ? 'COUNT(*)::INT AS count' : 'u.id';
  const limitClause = options.countOnly ? '' : 'LIMIT $4';
  const result = await readDb.query(
    `SELECT ${selectClause}
     FROM users u
     JOIN notification_preferences np
       ON np.user_id = u.id
      AND np.category = 'promo'
      AND np.marketing_enabled = TRUE
      AND np.in_app_enabled = TRUE
     WHERE u.role = 'customer'
       AND u.status = 'active'
       AND u.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM promo_notification_deliveries pnd
         WHERE pnd.user_id = u.id
           AND pnd.status = 'sent'
           AND pnd.created_at >= NOW() - INTERVAL '24 hours'
         GROUP BY pnd.user_id
         HAVING COUNT(*) >= $1
       )
       AND NOT EXISTS (
         SELECT 1
         FROM promo_notification_deliveries pnd
         WHERE pnd.user_id = u.id
           AND pnd.status = 'sent'
           AND pnd.created_at >= NOW() - INTERVAL '7 days'
         GROUP BY pnd.user_id
         HAVING COUNT(*) >= $2
       )
       AND NOT EXISTS (
         SELECT 1
         FROM promo_notification_deliveries pnd
         WHERE pnd.campaign_id = $3
           AND pnd.user_id = u.id
           AND pnd.status IN ('queued', 'sent')
       )
     ORDER BY u.created_at DESC
     ${limitClause}`,
    options.countOnly ? [maxPerDay, maxPerWeek, campaignId] : [maxPerDay, maxPerWeek, campaignId, limit]
  );
  if (options.countOnly) {
    return { count: integerValue(result.rows[0]?.count), users: [] as Array<{ id: string }> };
  }
  return { count: result.rows.length, users: result.rows as Array<{ id: string }> };
};

export const previewPromoNotificationAudience = async (campaignId: string, input: unknown = {}) => {
  uuidSchema.parse(campaignId);
  const parsed = promoNotificationSchema.partial().parse(input || {});
  const campaign = await getPromoCampaignById(campaignId);
  if (!campaign) {
    const error = new Error('Promo campaign not found');
    (error as any).statusCode = 404;
    throw error;
  }
  const audience = await fetchPromoAudience(campaignId, {
    maxPerDay: parsed.max_per_day,
    maxPerWeek: parsed.max_per_week,
    countOnly: true,
  });
  return {
    campaign_id: campaignId,
    eligible_user_count: audience.count,
    marketing_opt_in_required: true,
    max_per_day: parsed.max_per_day ?? 1,
    max_per_week: parsed.max_per_week ?? 3,
  };
};

export const sendPromoCampaignNotification = async (actor: PromoActor, campaignId: string, input: unknown = {}) => {
  assertActor(actor);
  uuidSchema.parse(campaignId);
  const parsed = promoNotificationSchema.parse(input || {});
  const campaign = await getPromoCampaignById(campaignId);
  if (!campaign) {
    const error = new Error('Promo campaign not found');
    (error as any).statusCode = 404;
    throw error;
  }
  if (!['active', 'scheduled'].includes(String(campaign.status))) {
    const error = new Error('Only active or scheduled promo campaigns can notify customers');
    (error as any).statusCode = 409;
    throw error;
  }
  if (parsed.channel === 'none') {
    await db.query(
      `INSERT INTO promo_audit_events (campaign_id, actor_id, actor_role, action, reason, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [campaignId, actor.id || null, actor.role || null, 'promo_notification_skipped', 'Campaign notification disabled', jsonValue({ channel: parsed.channel })]
    );
    return { campaign_id: campaignId, channel: parsed.channel, queued: 0, sent: 0, skipped: true };
  }
  if (isWithinQuietHours(parsed.quiet_hours_start, parsed.quiet_hours_end) && parsed.channel !== 'scheduled_push') {
    const error = new Error('Marketing push is blocked by quiet hours');
    (error as any).statusCode = 409;
    throw error;
  }

  const audience = await fetchPromoAudience(campaignId, {
    limit: parsed.limit,
    maxPerDay: parsed.max_per_day,
    maxPerWeek: parsed.max_per_week,
  });
  const notificationCopy = campaign.notification_copy && typeof campaign.notification_copy === 'object'
    ? campaign.notification_copy as Record<string, unknown>
    : {};
  const title = parsed.title || String(notificationCopy.title || campaign.name || 'Promo TEMBUS').slice(0, 80);
  const body = parsed.body || String(notificationCopy.body || 'Promo resmi tersedia untuk pengirimanmu.').slice(0, 160);
  const scheduledAt = parsed.scheduled_at?.toISOString() || null;
  let sent = 0;
  let queued = 0;
  let failed = 0;

  for (const user of audience.users) {
    const deliveryResult = await db.query(
      `INSERT INTO promo_notification_deliveries (
        campaign_id,
        user_id,
        channel,
        status,
        scheduled_at,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (campaign_id, user_id, channel) DO NOTHING
      RETURNING id`,
      [
        campaignId,
        user.id,
        parsed.channel,
        parsed.channel === 'scheduled_push' && scheduledAt ? 'queued' : 'sent',
        scheduledAt,
        jsonValue({ max_per_day: parsed.max_per_day, max_per_week: parsed.max_per_week }),
      ]
    );
    if ((deliveryResult.rowCount || 0) === 0) continue;
    if (parsed.channel === 'scheduled_push' && scheduledAt) {
      queued += 1;
      continue;
    }

    try {
      const notification = await createNotification({
        user_id: user.id,
        title,
        body,
        type: 'promo_campaign',
        category: 'promo',
        priority: 'normal',
        promo_id: campaignId,
        expires_at: campaign.ends_at,
        deep_link: promoDeepLink(campaign),
        metadata: {
          promo_id: campaignId,
          promo_code: campaign.code,
          channel: parsed.channel,
        },
      });
      await db.query(
        `UPDATE promo_notification_deliveries
         SET notification_id = $2,
             sent_at = NOW(),
             status = 'sent'
         WHERE id = $1`,
        [deliveryResult.rows[0].id, notification?.id || null]
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      await db.query(
        `UPDATE promo_notification_deliveries
         SET status = 'failed',
             failure_reason = $2
         WHERE id = $1`,
        [deliveryResult.rows[0].id, 'notification_dispatch_failed']
      );
      securityLog.warn('Promo notification dispatch failed', { campaignId, error });
    }
  }

  await db.query(
    `INSERT INTO promo_audit_events (campaign_id, actor_id, actor_role, action, reason, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      campaignId,
      actor.id || null,
      actor.role || null,
      'promo_notification_dispatched',
      'Promo notification dispatched from admin console',
      jsonValue({ channel: parsed.channel, sent, queued, failed, audience_count: audience.count }),
    ]
  );

  return {
    campaign_id: campaignId,
    channel: parsed.channel,
    eligible_user_count: audience.count,
    sent,
    queued,
    failed,
    frequency_cap: {
      max_per_day: parsed.max_per_day,
      max_per_week: parsed.max_per_week,
      quiet_hours_start: parsed.quiet_hours_start,
      quiet_hours_end: parsed.quiet_hours_end,
    },
  };
};

export const getPromoCampaignAnalytics = async (campaignId: string) => {
  uuidSchema.parse(campaignId);
  const campaign = await getPromoCampaignById(campaignId);
  if (!campaign) {
    const error = new Error('Promo campaign not found');
    (error as any).statusCode = 404;
    throw error;
  }

  const [redemptionResult, deliveryResult, auditResult] = await Promise.all([
    readDb.query(
      `SELECT
         COUNT(*)::INT AS redemption_total,
         COUNT(*) FILTER (WHERE status = 'reserved')::INT AS reservation_total,
         COUNT(*) FILTER (WHERE status = 'redeemed')::INT AS redeemed_total,
         COUNT(*) FILTER (WHERE status = 'released')::INT AS released_total,
         COALESCE(SUM(discount_idr) FILTER (WHERE status = 'redeemed'), 0)::INT AS discount_redeemed_idr,
         COALESCE(SUM(discount_idr) FILTER (WHERE status = 'reserved'), 0)::INT AS discount_reserved_idr,
         COALESCE(SUM(contribution_margin_idr) FILTER (WHERE status = 'redeemed'), 0)::INT AS contribution_margin_idr,
         COALESCE(AVG(margin_percent) FILTER (WHERE status = 'redeemed'), 0)::NUMERIC(8,3) AS average_margin_percent
       FROM promo_redemptions
       WHERE campaign_id = $1`,
      [campaignId]
    ),
    readDb.query(
      `SELECT
         COUNT(*)::INT AS delivery_total,
         COUNT(*) FILTER (WHERE status = 'queued')::INT AS queued_total,
         COUNT(*) FILTER (WHERE status = 'sent')::INT AS sent_total,
         COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed_total,
         COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::INT AS opened_total
       FROM promo_notification_deliveries
       WHERE campaign_id = $1`,
      [campaignId]
    ),
    readDb.query(
      `SELECT id, action, reason, actor_role, created_at
       FROM promo_audit_events
       WHERE campaign_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [campaignId]
    ),
  ]);

  const redemption = redemptionResult.rows[0] || {};
  const delivery = deliveryResult.rows[0] || {};
  const totalBudget = integerValue(campaign.total_budget_idr);
  const reservedBudget = integerValue(campaign.reserved_budget_idr);
  const redeemedBudget = integerValue(campaign.redeemed_budget_idr);
  const burnAmount = redeemedBudget + reservedBudget;
  const deliveryTotal = integerValue(delivery.delivery_total);
  const openedTotal = integerValue(delivery.opened_total);

  return {
    campaign_id: campaignId,
    status: campaign.status,
    budget: {
      total_budget_idr: totalBudget,
      reserved_budget_idr: reservedBudget,
      redeemed_budget_idr: redeemedBudget,
      remaining_budget_idr: Math.max(0, totalBudget - burnAmount),
      burn_rate_percent: totalBudget > 0 ? Number(((burnAmount / totalBudget) * 100).toFixed(2)) : 0,
    },
    redemption: {
      total: integerValue(redemption.redemption_total),
      reserved: integerValue(redemption.reservation_total),
      redeemed: integerValue(redemption.redeemed_total),
      released: integerValue(redemption.released_total),
      discount_reserved_idr: integerValue(redemption.discount_reserved_idr),
      discount_redeemed_idr: integerValue(redemption.discount_redeemed_idr),
      contribution_margin_idr: integerValue(redemption.contribution_margin_idr),
      average_margin_percent: decimalValue(redemption.average_margin_percent),
    },
    delivery: {
      total: deliveryTotal,
      queued: integerValue(delivery.queued_total),
      sent: integerValue(delivery.sent_total),
      failed: integerValue(delivery.failed_total),
      opened: openedTotal,
      open_rate_percent: deliveryTotal > 0 ? Number(((openedTotal / deliveryTotal) * 100).toFixed(2)) : 0,
    },
    audit_events: auditResult.rows,
  };
};

export const safePromoError = (error: unknown) => {
  if (error instanceof z.ZodError) {
    return { status: 400, message: 'Invalid promo payload', details: error.issues };
  }
  const statusCode = Number((error as any)?.statusCode || 500);
  const message = statusCode >= 500 ? 'Promo service failed' : String((error as any)?.message || 'Promo request failed');
  if (statusCode >= 500) {
    securityLog.error('Promo service failed', { error });
  } else {
    securityLog.warn('Promo request rejected', { statusCode, message });
  }
  return { status: statusCode, message };
};
