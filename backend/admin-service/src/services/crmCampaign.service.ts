import crypto from 'crypto';
import { PoolClient } from 'pg';
import { db } from '../db';
import { createNotification } from '../notifications';
import { canSendCampaign, evaluateCampaignGuardrails, validateCampaignAudience, validateCampaignFrequencyCap, CampaignGuardrailEvaluation } from './crmPolicy';
import { securityLog } from '../security/logRedaction';
import { enqueueOutboxEvent } from './eventOutbox';

type CampaignRow = {
  id: string;
  campaign_code: string;
  market_code: string;
  state: string;
  audience_definition: unknown;
  frequency_cap: unknown;
  holdout_percent: number | string;
  budget_minor?: number | string;
  guardrail_policy?: unknown;
};

type DispatchOptions = {
  templateKey: string;
  locale: string;
  variables?: Record<string, unknown>;
  limit?: number;
};

const safeObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const renderTemplate = (template: string, variables: Record<string, unknown>): string => (
  template.replace(/{{\s*([A-Za-z0-9_]{1,64})\s*}}/g, (_match, key: string) => {
    const value = variables[key];
    return value == null ? '' : String(value).slice(0, 240);
  }).trim()
);

/** Stable assignment keeps treatment/holdout membership consistent on retry. */
export const campaignAssignment = (campaignId: string, customerId: string, holdoutPercent: number): 'TREATMENT' | 'HOLDOUT' => {
  const digest = crypto.createHash('sha256').update(`${campaignId}:${customerId}`).digest();
  const bucket = digest.readUInt32BE(0) % 10000;
  return bucket < Math.round(Math.min(Math.max(holdoutPercent, 0), 100) * 100) ? 'HOLDOUT' : 'TREATMENT';
};

export const campaignRecipients = async (campaign: CampaignRow, limit: number): Promise<Array<{ id: string; personalization_allowed: boolean }>> => {
  const audience = validateCampaignAudience(campaign.audience_definition);
  if (!audience.valid) throw Object.assign(new Error('Campaign audience is not governed'), { statusCode: 400 });
  const serviceCodes = Array.isArray(audience.normalized.service_codes)
    ? audience.normalized.service_codes.map((code) => String(code).toLowerCase())
    : [];
  const lifecycleStage = String(audience.normalized.lifecycle_stage || '').toLowerCase();
  const orderCountBand = String(audience.normalized.order_count_band || '').toLowerCase();
  const lastOrderBand = String(audience.normalized.last_order_days_band || '').toLowerCase();
  const result = await db.query(
    `WITH customer_metrics AS (
       SELECT u.id::text AS id,
              COALESCE(COUNT(o.id) FILTER (WHERE o.status IN ('delivered','completed','pod_completed')), 0)::int AS order_count,
              COALESCE(EXTRACT(DAY FROM NOW() - MAX(o.created_at))::int, 999999) AS last_order_days,
              COALESCE(cp.marketing_allowed, FALSE) AS marketing_allowed,
              COALESCE(cp.personalization_allowed, FALSE) AS personalization_allowed
         FROM users u
         JOIN crm_preferences cp
           ON cp.user_id = u.id AND cp.market_code = $1 AND cp.channel = 'IN_APP'
         LEFT JOIN orders o ON o.customer_id = u.id
        WHERE u.role = 'customer'
          AND u.status = 'active'
          AND u.deleted_at IS NULL
          AND cp.marketing_allowed = TRUE
          AND NOT EXISTS (
            SELECT 1 FROM communication_preferences optout
             WHERE optout.user_id = u.id AND optout.category = 'marketing'
               AND optout.channel = 'in_app' AND optout.enabled = FALSE
          )
          AND ($2::text[] IS NULL OR EXISTS (
            SELECT 1 FROM orders service_order
             WHERE service_order.customer_id = u.id
               AND service_order.service_code = ANY($2::text[])
          ))
        GROUP BY u.id, cp.marketing_allowed, cp.personalization_allowed
     )
     SELECT id, personalization_allowed
       FROM customer_metrics
      WHERE ($3 = '' OR ($3 = 'new' AND order_count = 0) OR ($3 = 'active' AND order_count > 0) OR ($3 = 'at_risk' AND last_order_days BETWEEN 31 AND 180))
        AND ($4 = '' OR ($4 = 'zero' AND order_count = 0) OR ($4 = 'one_to_three' AND order_count BETWEEN 1 AND 3) OR ($4 = 'four_plus' AND order_count >= 4))
        AND ($5 = '' OR ($5 = 'zero_to_thirty' AND last_order_days BETWEEN 0 AND 30) OR ($5 = 'thirty_one_to_ninety' AND last_order_days BETWEEN 31 AND 90) OR ($5 = 'ninety_plus' AND last_order_days >= 91))
      ORDER BY id
      LIMIT $6`,
    [campaign.market_code, serviceCodes.length ? serviceCodes : null, lifecycleStage, orderCountBand, lastOrderBand, limit],
  );
  return result.rows;
};

export const previewCrmCampaign = async (campaignId: string) => {
  const campaignResult = await db.query<CampaignRow>(
    `SELECT id, campaign_code, market_code, state, audience_definition, frequency_cap, holdout_percent
       FROM crm_campaigns WHERE id = $1`,
    [campaignId],
  );
  const campaign = campaignResult.rows[0];
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });
  const audience = validateCampaignAudience(campaign.audience_definition);
  const cap = validateCampaignFrequencyCap(campaign.frequency_cap);
  if (!audience.valid || !cap.valid) throw Object.assign(new Error('Campaign governance is invalid'), { statusCode: 409 });
  const recipients = await campaignRecipients(campaign, 5000);
  return {
    campaign_id: campaign.id,
    campaign_code: campaign.campaign_code,
    market_code: campaign.market_code,
    state: campaign.state,
    estimated_audience: recipients.length,
    estimate_is_not_conversion: true,
    dispatch_cap: 5000,
    audience_definition: audience.normalized,
    frequency_cap: cap.normalized,
  };
};

export const getCrmCampaignMetrics = async (campaignId: string) => {
  const campaignResult = await db.query<CampaignRow>(
    `SELECT id, campaign_code, market_code, state, audience_definition, frequency_cap, holdout_percent, budget_minor, guardrail_policy
       FROM crm_campaigns WHERE id = $1`,
    [campaignId],
  );
  const campaign = campaignResult.rows[0];
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });
  const result = await db.query<{
    assignment: 'TREATMENT' | 'HOLDOUT';
    exposed: string;
    converted: string;
    completed_orders: string;
    completed_revenue_minor: string;
  }>(
    `SELECT e.assignment,
            COUNT(DISTINCT e.customer_id)::text AS exposed,
            COUNT(*) FILTER (WHERE e.first_conversion_at IS NOT NULL)::text AS converted,
            COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('delivered','completed','pod_completed'))::text AS completed_orders,
            COALESCE(SUM(CASE WHEN o.status IN ('delivered','completed','pod_completed') THEN COALESCE(o.total_price_minor, o.total_price_idr) ELSE 0 END), 0)::text AS completed_revenue_minor
       FROM crm_campaign_exposures e
       LEFT JOIN orders o
         ON o.customer_id = e.customer_id
        AND o.created_at >= e.assigned_at
      WHERE e.campaign_id = $1
      GROUP BY e.assignment
      ORDER BY e.assignment`,
    [campaignId],
  );
  const byAssignment = Object.fromEntries(result.rows.map((row) => [row.assignment, {
    exposed: Number(row.exposed),
    converted: Number(row.converted),
    completed_orders: Number(row.completed_orders),
    completed_revenue_minor: Number(row.completed_revenue_minor),
  }]));
  const treatment = byAssignment.TREATMENT || { exposed: 0, converted: 0, completed_orders: 0, completed_revenue_minor: 0 };
  const holdout = byAssignment.HOLDOUT || { exposed: 0, converted: 0, completed_orders: 0, completed_revenue_minor: 0 };
  const treatmentRate = treatment.exposed ? treatment.completed_orders / treatment.exposed : null;
  const holdoutRate = holdout.exposed ? holdout.completed_orders / holdout.exposed : null;
  const guardrails = await getCrmCampaignGuardrailMetrics(campaignId, campaign);
  return {
    campaign_id: campaign.id,
    campaign_code: campaign.campaign_code,
    budget_minor: Number(campaign.budget_minor || 0),
    guardrail_policy: safeObject(campaign.guardrail_policy),
    treatment,
    holdout,
    incremental_order_rate: treatmentRate == null || holdoutRate == null ? null : treatmentRate - holdoutRate,
    metric_source: 'canonical orders completed state joined to immutable campaign exposures',
    conversion_is_not_coupon_redemption: true,
    guardrails,
  };
};

/**
 * Read campaign guardrails from the same canonical order/refund/support and
 * reputation stores used by their owning domains. Margin is returned as NULL
 * when every completed order does not yet have settlement and courier-cost
 * evidence; an experiment must never mistake incomplete finance data for a
 * healthy margin.
 */
export const getCrmCampaignGuardrailMetrics = async (campaignId: string, campaignOverride?: CampaignRow): Promise<CampaignGuardrailEvaluation> => {
  const campaign = campaignOverride || (await db.query<CampaignRow>(
    `SELECT id, campaign_code, market_code, state, audience_definition, frequency_cap, holdout_percent, budget_minor, guardrail_policy
       FROM crm_campaigns WHERE id = $1`,
    [campaignId],
  )).rows[0];
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });
  const result = await db.query<{
    completed_orders: string;
    completed_revenue_minor: string;
    margin_complete_orders: string;
    contribution_margin_minor: string | null;
    refunded_orders: string;
    support_orders: string;
    spam_orders: string;
  }>(
    `WITH treatment_orders AS (
       SELECT DISTINCT e.customer_id, o.id, COALESCE(o.total_price_minor, o.total_price_idr, 0)::bigint AS revenue_minor,
              COALESCE(o.promo_subsidy_minor, o.promo_subsidy_idr, 0)::bigint AS subsidy_minor
         FROM crm_campaign_exposures e
         JOIN orders o ON o.customer_id = e.customer_id AND o.created_at >= e.assigned_at
        WHERE e.campaign_id = $1 AND e.assignment = 'TREATMENT'
          AND o.status IN ('delivered','completed','pod_completed')
     ), order_costs AS (
       SELECT t.*, ms.net_payout_minor,
              COALESCE((SELECT SUM(COALESCE(cel.amount_idr, 0))
                          FROM courier_earnings_ledger cel WHERE cel.order_id = t.id), 0)::bigint AS courier_cost_minor
         FROM treatment_orders t
         LEFT JOIN LATERAL (
           SELECT net_payout_minor
             FROM merchant_settlements WHERE order_id = t.id
            ORDER BY created_at DESC LIMIT 1
         ) ms ON TRUE
     )
     SELECT COUNT(*)::text AS completed_orders,
            COALESCE(SUM(revenue_minor), 0)::text AS completed_revenue_minor,
            COUNT(*) FILTER (WHERE net_payout_minor IS NOT NULL)::text AS margin_complete_orders,
            CASE WHEN COUNT(*) = COUNT(*) FILTER (WHERE net_payout_minor IS NOT NULL)
                 THEN COALESCE(SUM(revenue_minor - net_payout_minor - courier_cost_minor - subsidy_minor), 0)::text
                 ELSE NULL END AS contribution_margin_minor,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM refunds r WHERE r.order_id = order_costs.id AND r.status IN ('processed','refunded','completed')
            ))::text AS refunded_orders,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM support_case_links scl WHERE scl.reference_type = 'order' AND scl.reference_id = order_costs.id::text
            ))::text AS support_orders,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM reputation_reviews rr
               WHERE rr.order_id = order_costs.id AND (rr.state IN ('REPORTED','IN_REVIEW') OR LOWER(COALESCE(rr.moderation_reason, '')) LIKE '%spam%')
            ))::text AS spam_orders
       FROM order_costs`,
    [campaignId],
  );
  const row = result.rows[0];
  const completedOrders = Number(row?.completed_orders || 0);
  const denominator = completedOrders || 0;
  const toRate = (value: string | undefined) => denominator ? (Number(value || 0) / denominator) * 100 : null;
  return evaluateCampaignGuardrails(campaign.guardrail_policy, {
    completed_orders: completedOrders,
    completed_revenue_minor: Number(row?.completed_revenue_minor || 0),
    contribution_margin_minor: row?.contribution_margin_minor == null ? null : Number(row.contribution_margin_minor),
    refund_rate_pct: toRate(row?.refunded_orders),
    support_case_rate_pct: toRate(row?.support_orders),
    spam_complaint_rate_pct: toRate(row?.spam_orders),
  });
};

const enqueueCampaignExposureEvent = async (queryable: Pick<PoolClient, 'query'>, campaign: CampaignRow, customerId: string, assignment: 'TREATMENT' | 'HOLDOUT', exposureId: string) => {
  const subjectHash = crypto.createHash('sha256').update(customerId).digest('hex');
  await enqueueOutboxEvent(queryable, {
    aggregateType: 'crm_campaign',
    aggregateId: campaign.id,
    eventType: 'experiment.exposure',
    payload: {
      experiment_key: campaign.campaign_code,
      experiment_namespace: 'crm.lifecycle',
      treatment_variant: assignment,
      exposure_type: 'crm_campaign',
      surface: 'communication.in_app',
      assignment_key: subjectHash,
      exposure_id: exposureId,
      billable_impression: false,
    },
    marketCode: campaign.market_code,
    serviceName: 'admin-service',
    actorPseudonymousId: 'system',
    entityId: campaign.id,
    correlationId: `crm:${campaign.id}:${subjectHash.slice(0, 24)}`,
    traceId: `crm:${campaign.id}:${subjectHash.slice(0, 24)}`,
    piiClassification: 'restricted',
    fieldPiiClassification: { payload: 'restricted', assignment_key: 'confidential' },
    retentionClass: 'standard',
    dedupeKey: `crm-campaign-exposure:${campaign.id}:${customerId}`,
  });
};

const persistCampaignExposure = async (campaign: CampaignRow, customerId: string, assignment: 'TREATMENT' | 'HOLDOUT', templateKey: string, templateVersion: number, personalizationAllowed: boolean): Promise<string | null> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const exposure = await client.query<{ id: string }>(
      `INSERT INTO crm_campaign_exposures (campaign_id, customer_id, assignment, consent_snapshot, metadata)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       ON CONFLICT (campaign_id, customer_id) DO NOTHING
       RETURNING id`,
      [campaign.id, customerId, assignment, JSON.stringify({ market_code: campaign.market_code, channel: 'in_app', marketing_allowed: true, personalization_allowed: personalizationAllowed, captured_at: new Date().toISOString() }), JSON.stringify({ template_key: templateKey, template_version: templateVersion })],
    );
    if (!exposure.rowCount || !exposure.rows[0]) {
      await client.query('COMMIT');
      return null;
    }
    await enqueueCampaignExposureEvent(client, campaign, customerId, assignment, exposure.rows[0].id);
    await client.query('COMMIT');
    return exposure.rows[0].id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Resolve consented customers, persist treatment/holdout exposure, and send
 * only through the canonical Communication Platform event boundary. A failed
 * provider/inbox write is recorded as failed; it never changes order truth.
 */
export const dispatchCrmCampaign = async (campaignId: string, options: DispatchOptions) => {
  const campaignResult = await db.query<CampaignRow>(
    `SELECT id, campaign_code, market_code, state, audience_definition, frequency_cap, holdout_percent
       FROM crm_campaigns WHERE id = $1`,
    [campaignId],
  );
  const campaign = campaignResult.rows[0];
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });
  if (String(campaign.state).toUpperCase() !== 'ACTIVE') throw Object.assign(new Error('Campaign must be ACTIVE before dispatch'), { statusCode: 409 });
  const guardrails = await getCrmCampaignGuardrailMetrics(campaignId, campaign);
  if (guardrails.status !== 'PASS') {
    throw Object.assign(new Error(`Campaign guardrails do not permit dispatch: ${guardrails.breaches.join(', ') || 'insufficient_data'}`), { statusCode: 409 });
  }
  const templateKey = String(options.templateKey || '').trim();
  const locale = String(options.locale || 'id-ID').trim().slice(0, 16);
  if (!templateKey || !locale) throw Object.assign(new Error('Approved marketing template is required'), { statusCode: 400 });
  const templateResult = await db.query(
    `SELECT version, title_template, body_template, required_variables
       FROM communication_templates
      WHERE template_key = $1 AND market_code = $2 AND locale = $3
        AND channel = 'in_app' AND category = 'marketing'
        AND approval_status = 'approved' AND active = TRUE
      ORDER BY version DESC LIMIT 1`,
    [templateKey, campaign.market_code, locale],
  );
  const template = templateResult.rows[0];
  if (!template) throw Object.assign(new Error('Approved marketing template not found'), { statusCode: 409 });
  const variables = safeObject(options.variables);
  const requiredVariables = Array.isArray(template.required_variables) ? template.required_variables.map((value: unknown) => String(value)) : [];
  const missingVariables = requiredVariables.filter((key: string) => variables[key] == null);
  if (missingVariables.length) throw Object.assign(new Error(`Missing template variables: ${missingVariables.join(', ')}`), { statusCode: 400 });
  const title = renderTemplate(String(template.title_template || campaign.campaign_code), variables).slice(0, 160);
  const body = renderTemplate(String(template.body_template || ''), variables).slice(0, 2000);
  if (!body) throw Object.assign(new Error('Approved marketing template has empty body'), { statusCode: 409 });

  const cap = validateCampaignFrequencyCap(campaign.frequency_cap);
  if (!cap.valid) throw Object.assign(new Error('Campaign frequency cap is not governed'), { statusCode: 400 });
  const recipients = await campaignRecipients(campaign, Math.min(Math.max(Number(options.limit || 500), 1), 5000));
  const stats = { evaluated: recipients.length, holdout: 0, suppressed_frequency: 0, delivered: 0, failed: 0 };
  for (const recipient of recipients) {
    const assignment = campaignAssignment(campaign.id, recipient.id, Number(campaign.holdout_percent || 0));
    if (assignment === 'HOLDOUT') {
      stats.holdout += 1;
      await persistCampaignExposure(campaign, recipient.id, 'HOLDOUT', templateKey, template.version, recipient.personalization_allowed);
      continue;
    }
    const recent = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM crm_campaign_exposures e
         JOIN crm_campaigns c ON c.id = e.campaign_id
        WHERE e.customer_id = $1 AND e.assignment = 'TREATMENT'
          AND e.assigned_at >= NOW() - ($2::int * INTERVAL '1 day')
          AND c.state IN ('ACTIVE','SCHEDULED')`,
      [recipient.id, Number(cap.normalized.window_days)],
    );
    const frequencyCount = Number(recent.rows[0]?.count || 0);
    if (!canSendCampaign({ optedIn: true, frequencyCount, frequencyCap: Number(cap.normalized.per_user), holdout: false })) {
      stats.suppressed_frequency += 1;
      continue;
    }
    const exposureId = await persistCampaignExposure(campaign, recipient.id, assignment, templateKey, template.version, recipient.personalization_allowed);
    if (!exposureId) continue;
    const eventId = crypto.randomUUID();
    try {
      await db.query(
        `INSERT INTO communication_events
          (event_id, semantic_type, recipient_id, market_code, locale, category, priority,
           entity_type, entity_id, template_key, template_version, correlation_id, payload)
         VALUES ($1, 'crm.campaign.message', $2, $3, $4, 'marketing', 'normal',
                 'crm_campaign', $5, $6, $7, $8, $9::jsonb)`,
        [eventId, recipient.id, campaign.market_code, locale, campaign.id, templateKey, template.version, `crm:${campaign.id}:${recipient.id}`, JSON.stringify({ campaign_code: campaign.campaign_code, assignment, personalization_used: recipient.personalization_allowed })],
      );
      await db.query(
        `INSERT INTO communication_deliveries (event_id, channel, status, attempts)
         VALUES ($1, 'in_app', 'queued', 0) ON CONFLICT (event_id, channel) DO NOTHING`,
        [eventId],
      );
      await createNotification({ user_id: recipient.id, title, body, type: 'crm_campaign', category: 'promo', priority: 'normal', metadata: { campaign_id: campaign.id, communication_event_id: eventId, template_key: templateKey } });
      await db.query(`UPDATE communication_deliveries SET status = 'sent', attempts = attempts + 1, sent_at = NOW(), updated_at = NOW() WHERE event_id = $1 AND channel = 'in_app'`, [eventId]);
      await db.query(`UPDATE communication_events SET status = 'completed', updated_at = NOW() WHERE event_id = $1`, [eventId]);
      stats.delivered += 1;
    } catch (error) {
      await db.query(`UPDATE communication_deliveries SET status = 'failed', attempts = attempts + 1, provider_error = $2, updated_at = NOW() WHERE event_id = $1 AND channel = 'in_app'`, [eventId, String((error as Error)?.message || 'delivery_failed').slice(0, 500)]).catch(() => undefined);
      await db.query(`UPDATE communication_events SET status = 'failed', updated_at = NOW() WHERE event_id = $1`, [eventId]).catch(() => undefined);
      stats.failed += 1;
      securityLog.error('crm_campaign_delivery_failed', { campaign_id: campaign.id, recipient_id: recipient.id, event_id: eventId, error: (error as Error)?.message });
    }
  }
  return stats;
};

export const recordCrmCampaignConversion = async (campaignId: string, customerId: string, orderId: string) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const exposureResult = await client.query<{
      id: string;
      campaign_code: string;
      market_code: string;
    }>(
      `SELECT e.id, c.campaign_code, c.market_code
         FROM crm_campaign_exposures e
         JOIN crm_campaigns c ON c.id = e.campaign_id
        WHERE e.campaign_id = $1 AND e.customer_id = $2 AND e.assignment = 'TREATMENT'
          AND EXISTS (
            SELECT 1 FROM orders o
             WHERE o.id::text = $3::text
               AND o.customer_id = $2
               AND o.status IN ('paid','assigned','accepted','in_transit','delivered','completed','pod_completed')
          )
        LIMIT 1
        FOR UPDATE OF e`,
      [campaignId, customerId, orderId],
    );
    const exposure = exposureResult.rows[0];
    if (!exposure) {
      await client.query('COMMIT');
      return false;
    }

    const result = await client.query(
      `UPDATE crm_campaign_exposures
          SET first_conversion_at = NOW(),
              metadata = metadata || jsonb_build_object('first_conversion_order_id', $2::text)
        WHERE id = $1 AND first_conversion_at IS NULL
        RETURNING id`,
      [exposure.id, orderId],
    );
    if (!result.rowCount) {
      await client.query('COMMIT');
      return false;
    }

    const subjectHash = crypto.createHash('sha256').update(customerId).digest('hex');
    const orderHash = crypto.createHash('sha256').update(orderId).digest('hex');
    await enqueueOutboxEvent(client, {
      aggregateType: 'crm_campaign',
      aggregateId: campaignId,
      eventType: 'experiment.conversion',
      payload: {
        experiment_key: exposure.campaign_code,
        experiment_namespace: 'crm.lifecycle',
        conversion_type: 'completed_order',
        exposure_id: exposure.id,
        assignment_key: subjectHash,
        conversion_order_key: orderHash,
      },
      marketCode: exposure.market_code,
      serviceName: 'admin-service',
      actorPseudonymousId: 'system',
      entityId: campaignId,
      correlationId: `crm:${campaignId}:${orderHash.slice(0, 24)}`,
      traceId: `crm:${campaignId}:${orderHash.slice(0, 24)}`,
      piiClassification: 'restricted',
      fieldPiiClassification: { payload: 'restricted', assignment_key: 'confidential', conversion_order_key: 'confidential' },
      retentionClass: 'standard',
      dedupeKey: `crm-campaign-conversion:${campaignId}:${orderId}`,
    });
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
