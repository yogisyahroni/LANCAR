import { createHash } from 'node:crypto';
import { Request, Response } from 'express';
import { db } from '../db';
import { enqueueOutboxEvent } from '../services/eventOutbox';
import { EXPERIENCE_SURFACES } from '../services/experienceConfig';
import {
  evaluateExperienceGuardrail,
  EXPERIENCE_TELEMETRY_EVENT_TYPES,
  getExperienceObservability,
  isReliabilityTelemetry,
  type ExperienceTelemetryEventType,
} from '../services/experienceObservability';

const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MARKET_CODE = /^[a-z]{2}-[a-z0-9-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APP_VERSION = /^(?:unknown|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;
const ALLOWED_EVENT_TYPES = new Set<ExperienceTelemetryEventType>(EXPERIENCE_TELEMETRY_EVENT_TYPES);
const ALLOWED_COMPONENTS = new Set(['hero_banner', 'campaign_strip', 'promo_carousel']);
const ALLOWED_RUNTIME_COMPONENTS = new Set(['manifest', 'section', 'asset', 'deeplink', 'startup', 'network', 'runtime']);
const MARKETING_EVENT_TYPES = new Set<ExperienceTelemetryEventType>(['impression', 'click', 'dismiss']);

const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string') throw new Error(`${field} is required`);
  const normalized = value.trim().toLowerCase();
  if (!normalized || !IDENTIFIER.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
};

const headerText = (req: Request, ...names: string[]): string | undefined => {
  for (const name of names) {
    const value = req.header(name);
    if (value?.trim()) return value.trim();
  }
  return undefined;
};

const pseudonymousActor = (userId: string): string =>
  `actor_${createHash('sha256').update(userId).digest('hex')}`;

/**
 * Accepts only presentation telemetry. It writes through the existing
 * canonical event outbox so delivery/replay is handled by the same durable
 * event path as the rest of the platform; no customer identity is stored.
 */
export const recordCustomerExperienceEvent = async (req: Request, res: Response): Promise<void> => {
  const userId = String(req.user?.id || '').trim();
  if (!userId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return;
  }

  try {
    const eventId = String(req.body?.event_id || '').trim();
    if (!EVENT_ID.test(eventId)) throw new Error('event_id is invalid');

    const eventType = String(req.body?.event_type || '').trim().toLowerCase();
    if (!ALLOWED_EVENT_TYPES.has(eventType as ExperienceTelemetryEventType)) throw new Error('event_type is invalid');

    const isMarketingEvent = MARKETING_EVENT_TYPES.has(eventType as ExperienceTelemetryEventType);
    const component = text(req.body?.component || (isMarketingEvent ? undefined : 'runtime'), 'component');
    if (isMarketingEvent && !ALLOWED_COMPONENTS.has(component)) throw new Error('component is invalid');
    if (!isMarketingEvent && !ALLOWED_RUNTIME_COMPONENTS.has(component)) throw new Error('component is invalid');

    const campaignId = text(req.body?.campaign_id || (isMarketingEvent ? undefined : 'runtime'), 'campaign_id');
    const sectionId = text(req.body?.section_id || (isMarketingEvent ? undefined : 'runtime'), 'section_id');
    const revision = Number(req.body?.manifest_revision);
    if (!Number.isSafeInteger(revision) || revision < (isMarketingEvent ? 1 : 0)) throw new Error('manifest_revision is invalid');

    const marketCode = String(req.body?.market_code || 'id-jk').trim().toLowerCase();
    if (!MARKET_CODE.test(marketCode)) throw new Error('market_code is invalid');
    const surface = String(req.body?.surface || 'customer_android').trim().toLowerCase();
    if (!['customer_android', 'customer_web'].includes(surface)) throw new Error('surface is invalid');
    const appVersion = String(req.body?.app_version || 'unknown').trim();
    if (!APP_VERSION.test(appVersion)) throw new Error('app_version is invalid');
    const manifestId = req.body?.manifest_id == null || String(req.body.manifest_id).trim() === ''
      ? null
      : String(req.body.manifest_id).trim();
    if (manifestId && !UUID.test(manifestId)) throw new Error('manifest_id is invalid');
    const latencyMs = req.body?.latency_ms == null ? null : Number(req.body.latency_ms);
    if (latencyMs != null && (!Number.isSafeInteger(latencyMs) || latencyMs < 0 || latencyMs > 60_000)) {
      throw new Error('latency_ms is invalid');
    }
    if (req.body?.cache_hit != null && typeof req.body.cache_hit !== 'boolean') throw new Error('cache_hit is invalid');
    const cacheHit = req.body?.cache_hit == null ? null : req.body.cache_hit;
    const errorCode = req.body?.error_code == null ? null : text(req.body.error_code, 'error_code');

    const correlationId = headerText(req, 'x-correlation-id', 'x-request-id');
    const traceId = headerText(req, 'x-trace-id');
    await enqueueOutboxEvent(db, {
      aggregateType: isMarketingEvent ? 'experience_banner' : 'experience_runtime',
      eventType: `${isMarketingEvent ? 'experience.banner' : 'experience.runtime'}.${eventType}`,
      eventVersion: 1,
      payload: {
        event_id: eventId,
        event_type: eventType,
        surface,
        component,
        campaign_id: campaignId,
        section_id: sectionId,
        manifest_revision: revision,
        manifest_id: manifestId,
        app_version: appVersion,
        latency_ms: latencyMs,
        cache_hit: cacheHit,
        error_code: errorCode,
      },
      headers: {
        request_id: headerText(req, 'x-request-id'),
        correlation_id: correlationId,
        trace_id: traceId,
        market_code: marketCode,
        app_version: appVersion,
        source: surface,
      },
      marketCode,
      serviceName: surface === 'customer_web' ? 'customer-web' : 'customer-android',
      actorPseudonymousId: pseudonymousActor(userId),
      entityId: campaignId,
      correlationId,
      traceId,
      piiClassification: 'internal',
      fieldPiiClassification: {
        event_id: 'internal',
        event_type: 'public',
        surface: 'public',
        component: 'public',
        campaign_id: 'internal',
        section_id: 'internal',
        manifest_revision: 'public',
        manifest_id: 'internal',
        app_version: 'public',
        latency_ms: 'public',
        cache_hit: 'public',
        error_code: 'internal',
      },
      retentionClass: 'short',
      // The client UUID is the replay/dedupe identity for this presentation event.
      dedupeKey: `customer-experience:${eventId}`,
    });

    let guardrail = null;
    if (!isMarketingEvent && isReliabilityTelemetry(eventType as ExperienceTelemetryEventType) && manifestId) {
      try {
        guardrail = await evaluateExperienceGuardrail(manifestId, correlationId || null);
      } catch (error) {
        console.error(JSON.stringify({
          level: 'error',
          event: 'experience_guardrail_evaluation_failed',
          manifest_id: manifestId,
          manifest_revision: revision,
          error: error instanceof Error ? error.message : 'unknown',
        }));
      }
    }

    res.status(202).json({ success: true, data: { accepted: true, event_id: eventId, guardrail } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid experience event';
    if (/is required|is invalid/.test(message)) {
      res.status(400).json({ success: false, code: 'INVALID_EXPERIENCE_EVENT', message });
      return;
    }
    res.status(500).json({ success: false, code: 'EXPERIENCE_EVENT_UNAVAILABLE', message: 'Event could not be recorded' });
  }
};

const queryText = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return undefined;
  const normalized = String(value || '').trim();
  return normalized || undefined;
};

const rangeHours = (value: unknown): number => {
  const range = queryText(value) || '7D';
  if (range === '24H') return 24;
  if (range === '7D') return 24 * 7;
  if (range === '30D') return 24 * 30;
  if (range === '1Y') return 24 * 365;
  throw new Error('range is invalid');
};

export const getAdminExperienceObservability = async (req: Request, res: Response): Promise<void> => {
  try {
    const hours = rangeHours(req.query.range);
    const now = new Date();
    const filters = {
      from: new Date(now.getTime() - hours * 60 * 60 * 1000),
      to: now,
      manifestId: queryText(req.query.manifest_id),
      revision: queryText(req.query.revision) ? Number(queryText(req.query.revision)) : undefined,
      marketCode: queryText(req.query.market_code)?.toLowerCase(),
      surface: queryText(req.query.surface)?.toLowerCase(),
      appVersion: queryText(req.query.app_version),
    };
    if (filters.revision != null && (!Number.isInteger(filters.revision) || filters.revision < 0)) {
      throw new Error('revision is invalid');
    }
    if (filters.manifestId && !UUID.test(filters.manifestId)) throw new Error('manifest_id is invalid');
    if (filters.marketCode && !MARKET_CODE.test(filters.marketCode)) throw new Error('market_code is invalid');
    if (filters.surface && !EXPERIENCE_SURFACES.includes(filters.surface as typeof EXPERIENCE_SURFACES[number])) throw new Error('surface is invalid');
    if (filters.appVersion && !APP_VERSION.test(filters.appVersion)) throw new Error('app_version is invalid');
    const data = await getExperienceObservability(filters);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Experience observability unavailable';
    const status = /is invalid/.test(message) ? 400 : 500;
    res.status(status).json({ success: false, code: status === 400 ? 'INVALID_EXPERIENCE_OBSERVABILITY_FILTER' : 'EXPERIENCE_OBSERVABILITY_UNAVAILABLE', message });
  }
};

export const evaluateAdminExperienceGuardrail = async (req: Request, res: Response): Promise<void> => {
  try {
    const manifestId = String(req.params.manifestId || '').trim();
    if (!UUID.test(manifestId)) throw new Error('manifest_id is invalid');
    const result = await evaluateExperienceGuardrail(
      manifestId,
      headerText(req, 'x-correlation-id', 'x-request-id') || null,
    );
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Experience guardrail unavailable';
    const status = /is invalid/.test(message) ? 400 : 500;
    res.status(status).json({ success: false, code: status === 400 ? 'INVALID_EXPERIENCE_GUARDRAIL' : 'EXPERIENCE_GUARDRAIL_UNAVAILABLE', message });
  }
};
